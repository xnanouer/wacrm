-- ============================================================
-- 032_ticket_analytics.sql — Phase 5 ticket statistics
--
-- Aggregates operational ticket metrics in PostgreSQL so the
-- dashboard never needs to download full message histories. The
-- function is SECURITY INVOKER: existing RLS remains the authority
-- for which conversations, messages, contacts and events are visible.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_conversations_account_created
  ON conversations(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_account_closed
  ON conversations(account_id, closed_at DESC)
  WHERE closed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_sender_created
  ON messages(conversation_id, sender_type, created_at);

CREATE OR REPLACE FUNCTION get_ticket_analytics(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_timezone TEXT DEFAULT 'UTC',
  p_department_id UUID DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL,
  p_whatsapp_config_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    RAISE EXCEPTION 'Invalid analytics date range';
  END IF;

  IF p_to - p_from > INTERVAL '366 days' THEN
    RAISE EXCEPTION 'Analytics date range cannot exceed 366 days';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = p_timezone
  ) THEN
    RAISE EXCEPTION 'Invalid analytics timezone';
  END IF;

  WITH
  actor AS MATERIALIZED (
    SELECT p.account_id, p.account_role::text AS account_role
    FROM profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  ),
  account_tickets AS MATERIALIZED (
    SELECT c.*
    FROM conversations c
    JOIN actor a ON a.account_id = c.account_id
    WHERE (p_department_id IS NULL OR c.department_id = p_department_id)
      AND (
        p_whatsapp_config_id IS NULL
        OR c.whatsapp_config_id = p_whatsapp_config_id
      )
  ),
  scoped_tickets AS MATERIALIZED (
    SELECT c.*
    FROM account_tickets c
    WHERE p_agent_id IS NULL
      OR c.assigned_agent_id = p_agent_id
      OR c.accepted_by_user_id = p_agent_id
      OR c.closed_by_user_id = p_agent_id
      OR EXISTS (
        SELECT 1
        FROM ticket_events e
        WHERE e.conversation_id = c.id
          AND (
            e.from_agent_id = p_agent_id
            OR e.to_agent_id = p_agent_id
          )
      )
  ),
  first_inbound AS MATERIALIZED (
    SELECT c.id AS conversation_id, MIN(m.created_at) AS inbound_at
    FROM scoped_tickets c
    JOIN messages m ON m.conversation_id = c.id
    WHERE c.created_at >= p_from
      AND c.created_at < p_to
      AND m.sender_type = 'customer'
    GROUP BY c.id
  ),
  response_samples AS MATERIALIZED (
    SELECT
      fi.conversation_id,
      response.sender_id AS agent_id,
      EXTRACT(EPOCH FROM (response.created_at - fi.inbound_at)) / 60.0
        AS minutes
    FROM first_inbound fi
    CROSS JOIN LATERAL (
      SELECT m.sender_id, m.created_at
      FROM messages m
      WHERE m.conversation_id = fi.conversation_id
        AND m.sender_type = 'agent'
        AND m.created_at >= fi.inbound_at
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT 1
    ) response
    WHERE response.created_at >= fi.inbound_at
  ),
  resolution_samples AS MATERIALIZED (
    SELECT
      c.id AS conversation_id,
      c.closed_by_user_id AS agent_id,
      EXTRACT(EPOCH FROM (c.closed_at - c.created_at)) / 60.0 AS minutes
    FROM scoped_tickets c
    WHERE c.closed_at >= p_from
      AND c.closed_at < p_to
      AND c.closed_at >= c.created_at
  ),
  waiting_for_human AS (
    SELECT COUNT(*)::BIGINT AS total
    FROM scoped_tickets c
    CROSS JOIN LATERAL (
      SELECT
        MAX(m.created_at) FILTER (WHERE m.sender_type = 'customer')
          AS last_customer_at,
        MAX(m.created_at) FILTER (WHERE m.sender_type = 'agent')
          AS last_agent_at
      FROM messages m
      WHERE m.conversation_id = c.id
    ) activity
    WHERE c.status <> 'closed'
      AND activity.last_customer_at IS NOT NULL
      AND (
        activity.last_agent_at IS NULL
        OR activity.last_customer_at > activity.last_agent_at
      )
  ),
  overdue_follow_ups AS (
    SELECT COUNT(*)::BIGINT AS total
    FROM contacts c
    JOIN actor a ON a.account_id = c.account_id
    WHERE c.next_follow_up_at IS NOT NULL
      AND c.next_follow_up_at < NOW()
      AND (
        (
          p_department_id IS NULL
          AND p_agent_id IS NULL
          AND p_whatsapp_config_id IS NULL
          AND a.account_role IN ('owner', 'admin', 'viewer')
        )
        OR EXISTS (
          SELECT 1
          FROM scoped_tickets ticket
          WHERE ticket.contact_id = c.id
        )
      )
  ),
  summary AS (
    SELECT
      (
        SELECT COUNT(*) FROM scoped_tickets
        WHERE created_at >= p_from AND created_at < p_to
      )::BIGINT AS new_tickets,
      (
        SELECT COUNT(*) FROM scoped_tickets WHERE status = 'pending'
      )::BIGINT AS pending_now,
      (
        SELECT COUNT(*) FROM scoped_tickets
        WHERE closed_at >= p_from AND closed_at < p_to
      )::BIGINT AS closed_tickets,
      (
        SELECT ROUND(AVG(minutes)::NUMERIC, 1) FROM response_samples
      ) AS avg_first_response_minutes,
      (
        SELECT ROUND(AVG(minutes)::NUMERIC, 1) FROM resolution_samples
      ) AS avg_resolution_minutes,
      (
        SELECT COUNT(*)
        FROM ticket_events e
        JOIN scoped_tickets c ON c.id = e.conversation_id
        WHERE e.event_type = 'transferred'
          AND e.created_at >= p_from
          AND e.created_at < p_to
      )::BIGINT AS transfers,
      (SELECT total FROM waiting_for_human) AS customers_waiting,
      (SELECT total FROM overdue_follow_ups) AS overdue_follow_ups
  ),
  day_grid AS (
    SELECT day::DATE
    FROM generate_series(
      (p_from AT TIME ZONE p_timezone)::DATE,
      ((p_to - INTERVAL '1 microsecond') AT TIME ZONE p_timezone)::DATE,
      INTERVAL '1 day'
    ) day
  ),
  daily_metrics AS (
    SELECT
      d.day,
      COUNT(c.id) FILTER (
        WHERE (c.created_at AT TIME ZONE p_timezone)::DATE = d.day
      )::BIGINT AS new_tickets,
      COUNT(c.id) FILTER (
        WHERE c.closed_at IS NOT NULL
          AND (c.closed_at AT TIME ZONE p_timezone)::DATE = d.day
      )::BIGINT AS closed_tickets
    FROM day_grid d
    LEFT JOIN scoped_tickets c ON (
      c.created_at >= p_from
      AND c.created_at < p_to
      AND (c.created_at AT TIME ZONE p_timezone)::DATE = d.day
    ) OR (
      c.closed_at >= p_from
      AND c.closed_at < p_to
      AND (c.closed_at AT TIME ZONE p_timezone)::DATE = d.day
    )
    GROUP BY d.day
    ORDER BY d.day
  ),
  department_metrics AS (
    SELECT
      d.id AS department_id,
      d.name,
      d.color,
      COUNT(c.id) FILTER (
        WHERE c.created_at >= p_from AND c.created_at < p_to
      )::BIGINT AS new_tickets,
      COUNT(c.id) FILTER (WHERE c.status = 'pending')::BIGINT AS pending_now,
      COUNT(c.id) FILTER (
        WHERE c.closed_at >= p_from AND c.closed_at < p_to
      )::BIGINT AS closed_tickets
    FROM departments d
    JOIN actor a ON a.account_id = d.account_id
    LEFT JOIN scoped_tickets c ON c.department_id = d.id
    WHERE p_department_id IS NULL OR d.id = p_department_id
    GROUP BY d.id, d.name, d.color, d.position
    ORDER BY d.position, d.name
  ),
  agent_metrics AS (
    SELECT
      p.user_id AS agent_id,
      (
        SELECT COUNT(*) FROM scoped_tickets c
        WHERE c.assigned_agent_id = p.user_id AND c.status <> 'closed'
      )::BIGINT AS assigned_now,
      (
        SELECT COUNT(*) FROM scoped_tickets c
        WHERE c.accepted_by_user_id = p.user_id
          AND c.accepted_at >= p_from
          AND c.accepted_at < p_to
      )::BIGINT AS accepted_tickets,
      (
        SELECT COUNT(*) FROM scoped_tickets c
        WHERE c.closed_by_user_id = p.user_id
          AND c.closed_at >= p_from
          AND c.closed_at < p_to
      )::BIGINT AS closed_tickets,
      (
        SELECT ROUND(AVG(r.minutes)::NUMERIC, 1)
        FROM response_samples r
        WHERE r.agent_id = p.user_id
      ) AS avg_first_response_minutes,
      (
        SELECT ROUND(AVG(r.minutes)::NUMERIC, 1)
        FROM resolution_samples r
        WHERE r.agent_id = p.user_id
      ) AS avg_resolution_minutes
    FROM profiles p
    JOIN actor a ON a.account_id = p.account_id
    WHERE p.account_role::text IN ('owner', 'admin', 'supervisor', 'agent')
      AND (p_agent_id IS NULL OR p.user_id = p_agent_id)
    ORDER BY p.created_at
  ),
  status_metrics AS (
    SELECT
      states.status,
      COUNT(c.id)::BIGINT AS total
    FROM (
      VALUES ('pending', 1), ('open', 2), ('waiting', 3), ('closed', 4)
    ) AS states(status, position)
    LEFT JOIN scoped_tickets c ON c.status = states.status
    GROUP BY states.status, states.position
    ORDER BY states.position
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'timezone', p_timezone
    ),
    'summary', (
      SELECT jsonb_build_object(
        'new_tickets', new_tickets,
        'pending_now', pending_now,
        'closed_tickets', closed_tickets,
        'avg_first_response_minutes', avg_first_response_minutes,
        'avg_resolution_minutes', avg_resolution_minutes,
        'transfers', transfers,
        'customers_waiting', customers_waiting,
        'overdue_follow_ups', overdue_follow_ups
      )
      FROM summary
    ),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'day', TO_CHAR(day, 'YYYY-MM-DD'),
        'new_tickets', new_tickets,
        'closed_tickets', closed_tickets
      ) ORDER BY day)
      FROM daily_metrics
    ), '[]'::JSONB),
    'statuses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'status', status,
        'total', total
      ))
      FROM status_metrics
    ), '[]'::JSONB),
    'departments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'department_id', department_id,
        'name', name,
        'color', color,
        'new_tickets', new_tickets,
        'pending_now', pending_now,
        'closed_tickets', closed_tickets
      ))
      FROM department_metrics
    ), '[]'::JSONB),
    'agents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'agent_id', agent_id,
        'assigned_now', assigned_now,
        'accepted_tickets', accepted_tickets,
        'closed_tickets', closed_tickets,
        'avg_first_response_minutes', avg_first_response_minutes,
        'avg_resolution_minutes', avg_resolution_minutes
      ))
      FROM agent_metrics
    ), '[]'::JSONB)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

ALTER FUNCTION get_ticket_analytics(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, UUID, UUID
) OWNER TO postgres;

REVOKE ALL ON FUNCTION get_ticket_analytics(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, UUID, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_ticket_analytics(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, UUID, UUID
) TO authenticated;
