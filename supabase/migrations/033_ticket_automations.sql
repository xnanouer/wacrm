-- ============================================================
-- 033_ticket_automations.sql — Safe ticket-event automation bridge
--
-- This migration does not create or activate any automation. It only
-- queues future ticket events when an active matching automation exists.
-- ============================================================

-- One automation may see the same ticket event again after a worker
-- retry. The partial unique index makes that retry harmless at the
-- automation level while leaving non-ticket automation logs unchanged.
ALTER TABLE automation_logs
  ADD COLUMN IF NOT EXISTS ticket_event_id UUID
  REFERENCES ticket_events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_logs_ticket_event_once
  ON automation_logs(automation_id, ticket_event_id)
  WHERE ticket_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_logs_ticket_event
  ON automation_logs(ticket_event_id)
  WHERE ticket_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS automation_ticket_event_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  ticket_event_id UUID NOT NULL REFERENCES ticket_events(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'ticket_created', 'ticket_accepted', 'conversation_assigned',
    'ticket_unassigned', 'ticket_transferred', 'ticket_department_changed',
    'ticket_status_changed', 'ticket_waiting', 'ticket_closed', 'ticket_reopened'
  )),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT automation_ticket_event_queue_event_unique UNIQUE (ticket_event_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_ticket_event_queue_due
  ON automation_ticket_event_queue(available_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_automation_ticket_event_queue_account_created
  ON automation_ticket_event_queue(account_id, created_at DESC);

ALTER TABLE automation_ticket_event_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_ticket_event_queue_select ON automation_ticket_event_queue;
CREATE POLICY automation_ticket_event_queue_select
  ON automation_ticket_event_queue FOR SELECT
  USING (current_account_role(account_id) IN ('owner', 'admin'));

GRANT SELECT ON automation_ticket_event_queue TO authenticated;
GRANT ALL ON automation_ticket_event_queue TO service_role;

-- Translate the immutable ticket audit row into one automation trigger.
-- No backfill is performed: only ticket events created after 033 can queue.
-- If there is no active matching automation at event time, nothing is queued.
CREATE OR REPLACE FUNCTION enqueue_ticket_automation_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_type TEXT;
  v_contact_id UUID;
  v_vars JSONB;
BEGIN
  v_trigger_type := CASE NEW.event_type
    WHEN 'created' THEN 'ticket_created'
    WHEN 'accepted' THEN 'ticket_accepted'
    WHEN 'assigned' THEN 'conversation_assigned'
    WHEN 'unassigned' THEN 'ticket_unassigned'
    WHEN 'transferred' THEN 'ticket_transferred'
    WHEN 'department_changed' THEN 'ticket_department_changed'
    WHEN 'status_changed' THEN 'ticket_status_changed'
    WHEN 'waiting' THEN 'ticket_waiting'
    WHEN 'closed' THEN 'ticket_closed'
    WHEN 'reopened' THEN 'ticket_reopened'
    ELSE NULL
  END;

  IF v_trigger_type IS NULL OR NOT EXISTS (
    SELECT 1
    FROM automations a
    WHERE a.account_id = NEW.account_id
      AND a.trigger_type = v_trigger_type
      AND a.is_active = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  SELECT c.contact_id
    INTO v_contact_id
  FROM conversations c
  WHERE c.id = NEW.conversation_id
    AND c.account_id = NEW.account_id;

  v_vars := jsonb_strip_nulls(jsonb_build_object(
    'ticket_event_id', NEW.id,
    'ticket_event_type', NEW.event_type,
    'conversation_id', NEW.conversation_id,
    'from_status', NEW.from_status,
    'to_status', NEW.to_status,
    'from_agent_id', NEW.from_agent_id,
    'to_agent_id', NEW.to_agent_id,
    'from_department_id', NEW.from_department_id,
    'to_department_id', NEW.to_department_id,
    'note', NEW.note
  ));

  INSERT INTO automation_ticket_event_queue (
    account_id,
    ticket_event_id,
    conversation_id,
    contact_id,
    trigger_type,
    context
  ) VALUES (
    NEW.account_id,
    NEW.id,
    NEW.conversation_id,
    v_contact_id,
    v_trigger_type,
    jsonb_build_object(
      'ticket_event_id', NEW.id,
      'conversation_id', NEW.conversation_id,
      'agent_id', NEW.to_agent_id,
      'vars', v_vars
    )
  )
  ON CONFLICT (ticket_event_id) DO NOTHING;

  RETURN NEW;
END;
$$;

ALTER FUNCTION enqueue_ticket_automation_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION enqueue_ticket_automation_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_ticket_automation_event ON ticket_events;
CREATE TRIGGER on_ticket_automation_event
  AFTER INSERT ON ticket_events
  FOR EACH ROW EXECUTE FUNCTION enqueue_ticket_automation_event();

-- Atomically claim pending rows. Stale running rows are reclaimable after
-- ten minutes; the log-level unique index prevents duplicate side effects.
CREATE OR REPLACE FUNCTION claim_ticket_automation_events(p_limit INTEGER DEFAULT 50)
RETURNS SETOF automation_ticket_event_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE automation_ticket_event_queue
  SET status = 'failed',
      processed_at = NOW(),
      error_message = COALESCE(error_message, 'Maximum retry attempts exceeded')
  WHERE status = 'running'
    AND attempts >= 3
    AND claimed_at < NOW() - INTERVAL '10 minutes';

  RETURN QUERY
  WITH picked AS (
    SELECT q.id
    FROM automation_ticket_event_queue q
    WHERE q.attempts < 3
      AND (
        (q.status = 'pending' AND q.available_at <= NOW())
        OR (q.status = 'running' AND q.claimed_at < NOW() - INTERVAL '10 minutes')
      )
    ORDER BY q.available_at, q.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
  )
  UPDATE automation_ticket_event_queue q
  SET status = 'running',
      attempts = q.attempts + 1,
      claimed_at = NOW(),
      error_message = NULL
  FROM picked
  WHERE q.id = picked.id
  RETURNING q.*;
END;
$$;

ALTER FUNCTION claim_ticket_automation_events(INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION claim_ticket_automation_events(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_ticket_automation_events(INTEGER) TO service_role;
