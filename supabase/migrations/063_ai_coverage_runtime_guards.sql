-- Runtime guard refinements for migration 062. Records automatic coverage
-- transitions and surfaces point/reply limits to the human team.

SET search_path = public, pg_catalog;

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
  IF NOT FOUND OR v_ticket.assigned_agent_id IS NULL
     OR v_ticket.ai_autoreply_disabled
     OR v_ticket.human_requested_at IS NOT NULL
  THEN RETURN FALSE; END IF;

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
    THEN RETURN FALSE; END IF;

    IF v_ticket.after_hours_ai_reply_count >=
       v_config.after_hours_max_replies_per_conversation THEN
      UPDATE public.conversations SET
        ai_state = 'waiting_for_human', ai_autoreply_disabled = TRUE,
        ai_pause_reason = 'coverage_reply_limit', ai_paused_at = NOW(),
        updated_at = NOW()
      WHERE id = p_conversation_id;
      INSERT INTO public.ticket_events(
        account_id, conversation_id, event_type, note, metadata
      ) VALUES (
        v_ticket.account_id, p_conversation_id, 'ai_waiting_human',
        'Cobertura IA pausada: se alcanzó el máximo de respuestas.',
        jsonb_build_object(
          'reason', 'coverage_reply_limit',
          'reply_count', v_ticket.after_hours_ai_reply_count
        )
      );
      RETURN FALSE;
    END IF;

    v_timezone := COALESCE(v_config.timezone, 'America/Santiago');
    SELECT COALESCE(SUM(o.estimated_points), 0) INTO v_daily_used
    FROM public.ai_point_operations o
    WHERE o.account_id = v_ticket.account_id
      AND o.status IN ('reserved', 'completed')
      AND o.technical_metadata ->> 'surface' = 'after_hours_coverage'
      AND o.created_at >= date_trunc('day', NOW() AT TIME ZONE v_timezone)
        AT TIME ZONE v_timezone;
    SELECT COALESCE(SUM(o.estimated_points), 0) INTO v_monthly_used
    FROM public.ai_point_operations o
    WHERE o.account_id = v_ticket.account_id
      AND o.status IN ('reserved', 'completed')
      AND o.technical_metadata ->> 'surface' = 'after_hours_coverage'
      AND o.created_at >= date_trunc('month', NOW() AT TIME ZONE v_timezone)
        AT TIME ZONE v_timezone;

    IF (v_config.after_hours_daily_points_limit IS NOT NULL
        AND v_daily_used > v_config.after_hours_daily_points_limit)
       OR (v_config.after_hours_monthly_points_limit IS NOT NULL
        AND v_monthly_used > v_config.after_hours_monthly_points_limit)
    THEN
      UPDATE public.conversations SET
        ai_state = 'waiting_for_human', ai_autoreply_disabled = TRUE,
        ai_pause_reason = 'coverage_points_limit', ai_paused_at = NOW(),
        updated_at = NOW()
      WHERE id = p_conversation_id;
      INSERT INTO public.ticket_events(
        account_id, conversation_id, event_type, note, metadata
      ) VALUES (
        v_ticket.account_id, p_conversation_id, 'ai_no_points',
        'Cobertura IA pausada: se alcanzó el límite configurado de puntos.',
        jsonb_build_object(
          'reason', 'coverage_points_limit',
          'daily_used', v_daily_used,
          'monthly_used', v_monthly_used
        )
      );
      RETURN FALSE;
    END IF;
  END IF;

  IF p_max_replies IS NOT NULL AND v_ticket.ai_reply_count >= p_max_replies THEN
    UPDATE public.conversations SET
      ai_state = 'waiting_for_human', ai_autoreply_disabled = TRUE,
      ai_pause_reason = 'reply_limit', ai_paused_at = NOW(), updated_at = NOW()
    WHERE id = p_conversation_id;
    INSERT INTO public.ticket_events(
      account_id, conversation_id, event_type, note, metadata
    ) VALUES (
      v_ticket.account_id, p_conversation_id, 'ai_waiting_human',
      'IA pausada: se alcanzó el máximo de respuestas del chat.',
      jsonb_build_object('reason', 'reply_limit', 'reply_count', v_ticket.ai_reply_count)
    );
    RETURN FALSE;
  END IF;

  UPDATE public.conversations SET
    ai_reply_count = ai_reply_count + 1,
    after_hours_ai_reply_count = after_hours_ai_reply_count
      + CASE WHEN p_mode = 'after_hours' THEN 1 ELSE 0 END,
    ai_state = CASE WHEN p_mode = 'after_hours' THEN 'ai_after_hours' ELSE 'ai_active' END,
    ai_autoreply_disabled = FALSE,
    ai_pause_reason = NULL,
    ai_paused_at = NULL,
    updated_at = NOW()
  WHERE id = p_conversation_id;

  IF p_mode = 'after_hours' AND v_ticket.ai_state <> 'ai_after_hours' THEN
    INSERT INTO public.ticket_events(
      account_id, conversation_id, event_type, metadata
    ) VALUES (
      v_ticket.account_id, p_conversation_id, 'ai_coverage_started',
      jsonb_build_object(
        'assigned_agent_id', v_ticket.assigned_agent_id,
        'reason', 'assigned_user_unavailable'
      )
    );
  END IF;
  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.claim_ai_coverage_reply_slot(UUID, TEXT, INTEGER)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_ai_coverage_reply_slot(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_coverage_reply_slot(UUID, TEXT, INTEGER)
  TO service_role;

NOTIFY pgrst, 'reload schema';
