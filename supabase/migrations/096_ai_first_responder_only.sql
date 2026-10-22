-- ============================================================
-- 096_ai_first_responder_only.sql
-- A ticket belongs to the AI metric only when the bot was the
-- first outbound sender after the customer's initial message.
-- ============================================================

CREATE OR REPLACE FUNCTION get_ai_first_response_analytics(
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
    SELECT p.account_id
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
  ai_response_samples AS MATERIALIZED (
    SELECT
      fi.conversation_id,
      EXTRACT(EPOCH FROM (response.created_at - fi.inbound_at)) / 60.0
        AS minutes
    FROM first_inbound fi
    CROSS JOIN LATERAL (
      SELECT m.sender_type, m.created_at
      FROM messages m
      WHERE m.conversation_id = fi.conversation_id
        AND m.sender_type IN ('agent', 'bot')
        AND m.created_at >= fi.inbound_at
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT 1
    ) response
    WHERE response.sender_type = 'bot'
  )
  SELECT jsonb_build_object(
    'avg_first_response_minutes', ROUND(AVG(minutes)::NUMERIC, 1),
    'answered_tickets', COUNT(*)::BIGINT
  )
  INTO v_result
  FROM ai_response_samples;

  RETURN v_result;
END;
$$;

ALTER FUNCTION get_ai_first_response_analytics(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, UUID, UUID
) OWNER TO postgres;

REVOKE ALL ON FUNCTION get_ai_first_response_analytics(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, UUID, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_ai_first_response_analytics(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, UUID, UUID
) TO authenticated;
