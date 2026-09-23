-- ============================================================================
-- 062_ai_after_hours_coverage.sql
-- Temporary AI coverage for assigned executives and explicit human takeover.
--
-- The existing account AI agent remains the only agent. Coverage never changes
-- conversations.assigned_agent_id and is disabled by default.
-- ============================================================================

SET search_path = public, pg_catalog;

ALTER TABLE public.ai_configs
  ADD COLUMN IF NOT EXISTS after_hours_coverage_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS after_hours_scope TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS after_hours_max_replies_per_conversation INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS after_hours_daily_points_limit BIGINT,
  ADD COLUMN IF NOT EXISTS after_hours_monthly_points_limit BIGINT,
  ADD COLUMN IF NOT EXISTS after_hours_no_points_behavior TEXT NOT NULL DEFAULT 'leave_pending',
  ADD COLUMN IF NOT EXISTS manual_ai_delegation_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_after_hours_behavior_check;
ALTER TABLE public.ai_configs
  ADD CONSTRAINT ai_configs_after_hours_behavior_check CHECK (
    after_hours_behavior IN (
      'suggestions_only', 'automatic', 'log_only', 'handoff',
      'send_out_of_hours_message', 'disabled'
    )
  );

ALTER TABLE public.ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_after_hours_scope_check,
  DROP CONSTRAINT IF EXISTS ai_configs_after_hours_coverage_reply_limit_check,
  DROP CONSTRAINT IF EXISTS ai_configs_after_hours_daily_points_check,
  DROP CONSTRAINT IF EXISTS ai_configs_after_hours_monthly_points_check,
  DROP CONSTRAINT IF EXISTS ai_configs_after_hours_no_points_behavior_check;

ALTER TABLE public.ai_configs
  ADD CONSTRAINT ai_configs_after_hours_scope_check
    CHECK (after_hours_scope IN ('all', 'selected')),
  ADD CONSTRAINT ai_configs_after_hours_coverage_reply_limit_check
    CHECK (after_hours_max_replies_per_conversation BETWEEN 1 AND 50),
  ADD CONSTRAINT ai_configs_after_hours_daily_points_check
    CHECK (after_hours_daily_points_limit IS NULL OR after_hours_daily_points_limit > 0),
  ADD CONSTRAINT ai_configs_after_hours_monthly_points_check
    CHECK (after_hours_monthly_points_limit IS NULL OR after_hours_monthly_points_limit > 0),
  ADD CONSTRAINT ai_configs_after_hours_no_points_behavior_check
    CHECK (after_hours_no_points_behavior IN ('no_reply', 'leave_pending', 'static_message'));

COMMENT ON COLUMN public.ai_configs.after_hours_coverage_enabled IS
  'Lets the one account AI agent temporarily cover an assigned executive who is outside schedule or unavailable.';
COMMENT ON COLUMN public.ai_configs.manual_ai_delegation_enabled IS
  'Allows an administrator, or the assigned executive, to explicitly leave a conversation with the existing AI agent.';

CREATE TABLE IF NOT EXISTS public.ai_after_hours_users (
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  ai_config_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ai_config_id, user_id),
  CONSTRAINT ai_after_hours_users_config_account_fkey
    FOREIGN KEY (ai_config_id, account_id)
    REFERENCES public.ai_configs(id, account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_after_hours_users_account_user
  ON public.ai_after_hours_users(account_id, user_id);

ALTER TABLE public.ai_after_hours_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_after_hours_users_select ON public.ai_after_hours_users;
DROP POLICY IF EXISTS ai_after_hours_users_insert ON public.ai_after_hours_users;
DROP POLICY IF EXISTS ai_after_hours_users_delete ON public.ai_after_hours_users;
CREATE POLICY ai_after_hours_users_select ON public.ai_after_hours_users
  FOR SELECT USING (public.is_account_member(account_id));
CREATE POLICY ai_after_hours_users_insert ON public.ai_after_hours_users
  FOR INSERT WITH CHECK (
    public.is_account_member(account_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = ai_after_hours_users.user_id
        AND p.account_id = ai_after_hours_users.account_id
        AND p.account_role IN ('owner', 'admin', 'agent')
    )
  );
CREATE POLICY ai_after_hours_users_delete ON public.ai_after_hours_users
  FOR DELETE USING (public.is_account_member(account_id, 'admin'));
GRANT SELECT, INSERT, DELETE ON public.ai_after_hours_users TO authenticated;

-- A nullable manual status is an override. Without one, the personal weekly
-- schedule is used; if no personal schedule exists, the account AI schedule is
-- the safe fallback.
CREATE TABLE IF NOT EXISTS public.user_ai_availability (
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  manual_status TEXT,
  manual_status_until TIMESTAMPTZ,
  status_note TEXT NOT NULL DEFAULT '',
  updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, user_id),
  CONSTRAINT user_ai_availability_status_check CHECK (
    manual_status IS NULL OR manual_status IN (
      'available', 'unavailable', 'lunch', 'meeting', 'vacation', 'offline'
    )
  ),
  CONSTRAINT user_ai_availability_timezone_check
    CHECK (length(trim(timezone)) BETWEEN 1 AND 80),
  CONSTRAINT user_ai_availability_note_check
    CHECK (length(status_note) <= 300)
);

CREATE TABLE IF NOT EXISTS public.user_ai_availability_hours (
  account_id UUID NOT NULL,
  user_id UUID NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIME NOT NULL DEFAULT '09:00',
  ends_at TIME NOT NULL DEFAULT '18:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, user_id, day_of_week),
  CONSTRAINT user_ai_availability_hours_user_fkey
    FOREIGN KEY (account_id, user_id)
    REFERENCES public.user_ai_availability(account_id, user_id) ON DELETE CASCADE,
  CONSTRAINT user_ai_availability_hours_range_check CHECK (starts_at < ends_at)
);

DROP TRIGGER IF EXISTS set_updated_at ON public.user_ai_availability;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_ai_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON public.user_ai_availability_hours;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_ai_availability_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_ai_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_availability_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_ai_availability_select ON public.user_ai_availability;
DROP POLICY IF EXISTS user_ai_availability_insert ON public.user_ai_availability;
DROP POLICY IF EXISTS user_ai_availability_update ON public.user_ai_availability;
CREATE POLICY user_ai_availability_select ON public.user_ai_availability
  FOR SELECT USING (public.is_account_member(account_id));
CREATE POLICY user_ai_availability_insert ON public.user_ai_availability
  FOR INSERT WITH CHECK (
    public.is_account_member(account_id, 'admin')
    OR (auth.uid() = user_id AND public.is_account_member(account_id))
  );
CREATE POLICY user_ai_availability_update ON public.user_ai_availability
  FOR UPDATE USING (
    public.is_account_member(account_id, 'admin')
    OR (auth.uid() = user_id AND public.is_account_member(account_id))
  ) WITH CHECK (
    public.is_account_member(account_id, 'admin')
    OR (auth.uid() = user_id AND public.is_account_member(account_id))
  );
DROP POLICY IF EXISTS user_ai_availability_hours_select ON public.user_ai_availability_hours;
DROP POLICY IF EXISTS user_ai_availability_hours_insert ON public.user_ai_availability_hours;
DROP POLICY IF EXISTS user_ai_availability_hours_update ON public.user_ai_availability_hours;
DROP POLICY IF EXISTS user_ai_availability_hours_delete ON public.user_ai_availability_hours;
CREATE POLICY user_ai_availability_hours_select ON public.user_ai_availability_hours
  FOR SELECT USING (public.is_account_member(account_id));
CREATE POLICY user_ai_availability_hours_insert ON public.user_ai_availability_hours
  FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY user_ai_availability_hours_update ON public.user_ai_availability_hours
  FOR UPDATE USING (public.is_account_member(account_id, 'admin'))
  WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY user_ai_availability_hours_delete ON public.user_ai_availability_hours
  FOR DELETE USING (public.is_account_member(account_id, 'admin'));
GRANT SELECT, INSERT, UPDATE ON public.user_ai_availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_availability_hours TO authenticated;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ai_state TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS ai_pause_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS after_hours_ai_reply_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ai_reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_human_takeover_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS human_takeover_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS human_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_ai_activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_ai_activated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_ai_state_check,
  DROP CONSTRAINT IF EXISTS conversations_after_hours_ai_reply_count_check;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_ai_state_check CHECK (
    ai_state IN ('idle', 'ai_active', 'ai_after_hours', 'ai_paused', 'human_active', 'waiting_for_human')
  ),
  ADD CONSTRAINT conversations_after_hours_ai_reply_count_check
    CHECK (after_hours_ai_reply_count >= 0);

CREATE INDEX IF NOT EXISTS idx_conversations_account_ai_state
  ON public.conversations(account_id, ai_state, updated_at DESC);

ALTER TABLE public.ticket_events
  DROP CONSTRAINT IF EXISTS ticket_events_event_type_check;
ALTER TABLE public.ticket_events
  ADD CONSTRAINT ticket_events_event_type_check CHECK (event_type IN (
    'created', 'accepted', 'assigned', 'unassigned', 'transferred',
    'department_changed', 'status_changed', 'waiting', 'closed', 'reopened',
    'ai_coverage_started', 'ai_coverage_paused', 'ai_waiting_human',
    'ai_no_points', 'ai_returned', 'ai_manual_activation'
  ));

CREATE OR REPLACE FUNCTION public.is_user_unavailable_for_ai(
  p_account_id UUID,
  p_user_id UUID,
  p_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone TEXT := 'America/Santiago';
  v_status TEXT;
  v_until TIMESTAMPTZ;
  v_local TIMESTAMP;
  v_day SMALLINT;
  v_time TIME;
  v_active BOOLEAN;
  v_start TIME;
  v_end TIME;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.account_id = p_account_id AND p.user_id = p_user_id
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT a.timezone, a.manual_status, a.manual_status_until
    INTO v_timezone, v_status, v_until
  FROM public.user_ai_availability a
  WHERE a.account_id = p_account_id AND a.user_id = p_user_id;

  v_timezone := COALESCE(v_timezone, (
    SELECT c.timezone FROM public.ai_configs c WHERE c.account_id = p_account_id
  ), 'America/Santiago');

  IF v_status IS NOT NULL AND (v_until IS NULL OR v_until > p_at) THEN
    RETURN v_status <> 'available';
  END IF;

  v_local := p_at AT TIME ZONE v_timezone;
  v_day := EXTRACT(DOW FROM v_local)::SMALLINT;
  v_time := v_local::TIME;

  SELECT h.is_active, h.starts_at, h.ends_at
    INTO v_active, v_start, v_end
  FROM public.user_ai_availability_hours h
  WHERE h.account_id = p_account_id
    AND h.user_id = p_user_id
    AND h.day_of_week = v_day;

  IF NOT FOUND THEN
    SELECT h.is_active, h.starts_at, h.ends_at
      INTO v_active, v_start, v_end
    FROM public.ai_agent_business_hours h
    JOIN public.ai_configs c ON c.id = h.ai_config_id
    WHERE h.account_id = p_account_id AND h.day_of_week = v_day
    LIMIT 1;
  END IF;

  IF v_active IS DISTINCT FROM TRUE THEN RETURN TRUE; END IF;
  RETURN NOT (v_time >= v_start AND v_time < v_end);
END;
$$;

REVOKE ALL ON FUNCTION public.is_user_unavailable_for_ai(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_unavailable_for_ai(UUID, UUID, TIMESTAMPTZ)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delegate_conversation_to_ai(p_conversation_id UUID)
RETURNS SETOF public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ticket public.conversations%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT * INTO v_ticket FROM public.conversations
  WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;
  v_role := public.current_account_role(v_ticket.account_id);
  IF v_role NOT IN ('owner', 'admin')
     AND v_ticket.assigned_agent_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ai_delegation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_ticket.assigned_agent_id IS NULL OR v_ticket.status NOT IN ('open', 'waiting') THEN
    RAISE EXCEPTION 'ai_delegation_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_configs c
    WHERE c.account_id = v_ticket.account_id
      AND c.is_active = TRUE
      AND c.auto_reply_enabled = TRUE
      AND c.operating_mode = 'automatic'
      AND c.manual_ai_delegation_enabled = TRUE
  ) THEN
    RAISE EXCEPTION 'ai_delegation_disabled' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.ai_workflow_authorized', 'true', TRUE);
  UPDATE public.conversations SET
    ai_state = 'ai_active', ai_autoreply_disabled = FALSE,
    ai_pause_reason = NULL, ai_paused_at = NULL,
    manual_ai_activated_at = NOW(), manual_ai_activated_by = auth.uid(),
    human_requested_at = NULL, updated_at = NOW()
  WHERE id = p_conversation_id;

  INSERT INTO public.ticket_events(account_id, conversation_id, event_type, actor_user_id, metadata)
  VALUES (v_ticket.account_id, p_conversation_id, 'ai_manual_activation', auth.uid(),
    jsonb_build_object('assigned_agent_id', v_ticket.assigned_agent_id));
  RETURN QUERY SELECT * FROM public.conversations WHERE id = p_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.take_conversation_from_ai(p_conversation_id UUID)
RETURNS SETOF public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ticket public.conversations%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT * INTO v_ticket FROM public.conversations
  WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;
  v_role := public.current_account_role(v_ticket.account_id);
  IF v_role NOT IN ('owner', 'admin')
     AND v_ticket.assigned_agent_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ai_takeover_forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.ai_workflow_authorized', 'true', TRUE);
  UPDATE public.conversations SET
    ai_state = 'human_active', ai_autoreply_disabled = TRUE,
    ai_pause_reason = 'human_takeover', ai_paused_at = NOW(),
    last_human_takeover_at = NOW(), human_takeover_by = auth.uid(),
    manual_ai_activated_at = NULL, manual_ai_activated_by = NULL,
    updated_at = NOW()
  WHERE id = p_conversation_id;

  INSERT INTO public.ticket_events(account_id, conversation_id, event_type, actor_user_id, metadata)
  VALUES (v_ticket.account_id, p_conversation_id, 'ai_coverage_paused', auth.uid(),
    jsonb_build_object('previous_ai_state', v_ticket.ai_state));
  RETURN QUERY SELECT * FROM public.conversations WHERE id = p_conversation_id;
END;
$$;

-- Called only after the server has reserved Nexora Points. The row lock makes
-- reply caps and coverage transitions deterministic for concurrent inbound.
CREATE OR REPLACE FUNCTION public.claim_ai_coverage_reply_slot(
  p_conversation_id UUID,
  p_mode TEXT,
  p_max_replies INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ticket public.conversations%ROWTYPE;
  v_config public.ai_configs%ROWTYPE;
  v_timezone TEXT;
  v_daily_used BIGINT;
  v_monthly_used BIGINT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'AI_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('manual', 'after_hours') THEN RETURN FALSE; END IF;

  SELECT * INTO v_ticket FROM public.conversations
  WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.assigned_agent_id IS NULL THEN RETURN FALSE; END IF;
  SELECT * INTO v_config FROM public.ai_configs
  WHERE account_id = v_ticket.account_id AND is_active = TRUE;
  IF NOT FOUND OR NOT v_config.auto_reply_enabled
     OR v_config.operating_mode <> 'automatic' THEN RETURN FALSE; END IF;

  IF p_mode = 'manual' THEN
    IF NOT v_config.manual_ai_delegation_enabled OR v_ticket.ai_state <> 'ai_active' THEN
      RETURN FALSE;
    END IF;
  ELSE
    IF NOT v_config.after_hours_coverage_enabled
       OR v_config.after_hours_behavior <> 'automatic'
       OR NOT public.is_user_unavailable_for_ai(
         v_ticket.account_id, v_ticket.assigned_agent_id, NOW()
       )
       OR (v_config.after_hours_scope = 'selected' AND NOT EXISTS (
         SELECT 1 FROM public.ai_after_hours_users u
         WHERE u.ai_config_id = v_config.id
           AND u.account_id = v_ticket.account_id
           AND u.user_id = v_ticket.assigned_agent_id
       ))
       OR v_ticket.after_hours_ai_reply_count >= v_config.after_hours_max_replies_per_conversation
    THEN RETURN FALSE; END IF;

    v_timezone := COALESCE(v_config.timezone, 'America/Santiago');
    SELECT COALESCE(SUM(o.estimated_points), 0)
      INTO v_daily_used
    FROM public.ai_point_operations o
    WHERE o.account_id = v_ticket.account_id
      AND o.status IN ('reserved', 'completed')
      AND o.technical_metadata ->> 'surface' = 'after_hours_coverage'
      AND o.created_at >= date_trunc('day', NOW() AT TIME ZONE v_timezone) AT TIME ZONE v_timezone;
    SELECT COALESCE(SUM(o.estimated_points), 0)
      INTO v_monthly_used
    FROM public.ai_point_operations o
    WHERE o.account_id = v_ticket.account_id
      AND o.status IN ('reserved', 'completed')
      AND o.technical_metadata ->> 'surface' = 'after_hours_coverage'
      AND o.created_at >= date_trunc('month', NOW() AT TIME ZONE v_timezone) AT TIME ZONE v_timezone;
    IF (v_config.after_hours_daily_points_limit IS NOT NULL
        AND v_daily_used > v_config.after_hours_daily_points_limit)
       OR (v_config.after_hours_monthly_points_limit IS NOT NULL
        AND v_monthly_used > v_config.after_hours_monthly_points_limit)
    THEN RETURN FALSE; END IF;
  END IF;

  IF p_max_replies IS NOT NULL AND v_ticket.ai_reply_count >= p_max_replies THEN
    RETURN FALSE;
  END IF;

  PERFORM set_config('app.ai_workflow_authorized', 'true', TRUE);
  UPDATE public.conversations SET
    ai_reply_count = ai_reply_count + 1,
    after_hours_ai_reply_count = after_hours_ai_reply_count + CASE WHEN p_mode = 'after_hours' THEN 1 ELSE 0 END,
    ai_state = CASE WHEN p_mode = 'after_hours' THEN 'ai_after_hours' ELSE 'ai_active' END,
    ai_autoreply_disabled = FALSE,
    ai_pause_reason = NULL,
    ai_paused_at = NULL,
    updated_at = NOW()
  WHERE id = p_conversation_id;
  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.delegate_conversation_to_ai(UUID) OWNER TO postgres;
ALTER FUNCTION public.take_conversation_from_ai(UUID) OWNER TO postgres;
ALTER FUNCTION public.claim_ai_coverage_reply_slot(UUID, TEXT, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delegate_conversation_to_ai(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.take_conversation_from_ai(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_ai_coverage_reply_slot(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delegate_conversation_to_ai(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.take_conversation_from_ai(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_coverage_reply_slot(UUID, TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_ai_workflow_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.role() = 'authenticated'
     AND NULLIF(current_setting('app.ai_workflow_authorized', TRUE), '') IS DISTINCT FROM 'true'
     AND (
       NEW.ai_state IS DISTINCT FROM OLD.ai_state
       OR NEW.ai_autoreply_disabled IS DISTINCT FROM OLD.ai_autoreply_disabled
       OR NEW.ai_reply_count IS DISTINCT FROM OLD.ai_reply_count
       OR NEW.after_hours_ai_reply_count IS DISTINCT FROM OLD.after_hours_ai_reply_count
       OR NEW.manual_ai_activated_at IS DISTINCT FROM OLD.manual_ai_activated_at
       OR NEW.manual_ai_activated_by IS DISTINCT FROM OLD.manual_ai_activated_by
     )
  THEN
    RAISE EXCEPTION 'ai_workflow_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_ai_workflow_write ON public.conversations;
CREATE TRIGGER enforce_ai_workflow_write
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ai_workflow_write();

NOTIFY pgrst, 'reload schema';
