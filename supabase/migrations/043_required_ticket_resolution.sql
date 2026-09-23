-- ============================================================
-- 043 — Mandatory resolution label + internal note
-- ============================================================

-- Human users may only transition a ticket to `closed` through the
-- transactional resolve_ticket RPC below. Service-role integrations remain
-- able to run trusted automations without impersonating an agent.
CREATE OR REPLACE FUNCTION enforce_ticket_resolution_details()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'closed'
     AND OLD.status IS DISTINCT FROM 'closed'
     AND auth.role() = 'authenticated'
     AND NULLIF(
       current_setting('app.ticket_resolution_authorized', TRUE),
       ''
     ) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'resolution_details_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION enforce_ticket_resolution_details() OWNER TO postgres;

DROP TRIGGER IF EXISTS enforce_ticket_resolution_details ON conversations;
CREATE TRIGGER enforce_ticket_resolution_details
  BEFORE UPDATE OF status ON conversations
  FOR EACH ROW EXECUTE FUNCTION enforce_ticket_resolution_details();

CREATE OR REPLACE FUNCTION resolve_ticket(
  p_conversation_id UUID,
  p_note TEXT,
  p_tag_ids UUID[]
) RETURNS SETOF conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket conversations%ROWTYPE;
  v_note TEXT;
  v_tag_ids UUID[];
BEGIN
  v_note := trim(COALESCE(p_note, ''));
  IF length(v_note) = 0 THEN
    RAISE EXCEPTION 'resolution_note_required' USING ERRCODE = 'P0001';
  END IF;
  IF length(v_note) > 5000 THEN
    RAISE EXCEPTION 'resolution_note_too_long' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT item.tag_id), ARRAY[]::UUID[])
  INTO v_tag_ids
  FROM unnest(COALESCE(p_tag_ids, ARRAY[]::UUID[])) AS item(tag_id)
  WHERE item.tag_id IS NOT NULL;

  IF cardinality(v_tag_ids) = 0 THEN
    RAISE EXCEPTION 'resolution_tag_required' USING ERRCODE = 'P0001';
  END IF;
  IF cardinality(v_tag_ids) > 20 THEN
    RAISE EXCEPTION 'too_many_resolution_tags' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_ticket
  FROM conversations
  WHERE id = p_conversation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT can_operate_ticket(v_ticket.id) THEN
    RAISE EXCEPTION 'ticket_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_ticket.status = 'closed' THEN
    RAISE EXCEPTION 'ticket_already_closed' USING ERRCODE = 'P0001';
  END IF;
  IF v_ticket.status = 'pending' OR v_ticket.assigned_agent_id IS NULL THEN
    RAISE EXCEPTION 'accept_ticket_first' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_tag_ids) AS requested(tag_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM tags tag
      WHERE tag.id = requested.tag_id
        AND tag.account_id = v_ticket.account_id
    )
  ) THEN
    RAISE EXCEPTION 'invalid_resolution_tag' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO contact_tags (contact_id, tag_id)
  SELECT v_ticket.contact_id, requested.tag_id
  FROM unnest(v_tag_ids) AS requested(tag_id)
  ON CONFLICT (contact_id, tag_id) DO NOTHING;

  INSERT INTO ticket_notes (
    account_id,
    conversation_id,
    contact_id,
    author_user_id,
    body
  ) VALUES (
    v_ticket.account_id,
    v_ticket.id,
    v_ticket.contact_id,
    auth.uid(),
    v_note
  );

  PERFORM set_config('app.ticket_event_note', v_note, TRUE);
  PERFORM set_config('app.ticket_resolution_authorized', 'true', TRUE);
  PERFORM set_config('app.ticket_workflow_authorized', 'true', TRUE);

  UPDATE conversations SET
    status = 'closed',
    status_changed_at = NOW(),
    waiting_since = NULL,
    closed_at = NOW(),
    closed_by_user_id = auth.uid(),
    updated_at = NOW()
  WHERE id = p_conversation_id;

  RETURN QUERY
  SELECT * FROM conversations WHERE id = p_conversation_id;
END;
$$;

ALTER FUNCTION resolve_ticket(UUID, TEXT, UUID[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION resolve_ticket(UUID, TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_ticket(UUID, TEXT, UUID[]) TO authenticated;
