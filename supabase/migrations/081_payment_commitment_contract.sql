-- Second account-scoped contract template: vehicle payment commitment.

ALTER TABLE public.contracts
  DROP CONSTRAINT IF EXISTS contracts_template_key_check;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_template_key_check
  CHECK (template_key IN ('vehicle_consignment_v1', 'payment_commitment_v1'));

CREATE OR REPLACE FUNCTION public.create_payment_commitment_contract(p_payload JSONB)
RETURNS public.contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_settings public.contract_settings%ROWTYPE;
  v_contract public.contracts%ROWTYPE;
  v_sequence BIGINT;
  v_number TEXT;
  v_contact_id UUID;
  v_conversation_id UUID;
  v_catalog_item_id UUID;
  v_executive_user_id UUID;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = auth.uid();
  IF NOT FOUND OR NOT public.is_account_member(v_profile.account_id, 'agent') THEN
    RAISE EXCEPTION 'contract_create_forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.contract_settings (account_id) VALUES (v_profile.account_id)
  ON CONFLICT (account_id) DO NOTHING;
  SELECT * INTO v_settings FROM public.contract_settings
  WHERE account_id = v_profile.account_id FOR UPDATE;
  v_sequence := v_settings.next_sequence;
  v_number := v_settings.contract_prefix || '-' || lpad(v_sequence::TEXT, v_settings.sequence_digits, '0');
  UPDATE public.contract_settings SET next_sequence = next_sequence + 1
  WHERE account_id = v_profile.account_id;

  v_contact_id := NULLIF(p_payload->>'contact_id', '')::UUID;
  v_conversation_id := NULLIF(p_payload->>'conversation_id', '')::UUID;
  v_catalog_item_id := NULLIF(p_payload->>'catalog_item_id', '')::UUID;
  v_executive_user_id := COALESCE(NULLIF(p_payload->>'executive_user_id', '')::UUID, auth.uid());

  IF v_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE id = v_contact_id AND account_id = v_profile.account_id
  ) THEN RAISE EXCEPTION 'contract_contact_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_catalog_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.catalog_items WHERE id = v_catalog_item_id AND account_id = v_profile.account_id
  ) THEN RAISE EXCEPTION 'contract_catalog_item_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = v_conversation_id AND account_id = v_profile.account_id
      AND (v_contact_id IS NULL OR contact_id = v_contact_id)
      AND public.can_operate_ticket(id)
  ) THEN RAISE EXCEPTION 'contract_conversation_forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = v_executive_user_id AND account_id = v_profile.account_id
  ) THEN RAISE EXCEPTION 'contract_executive_not_found' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.contracts (
    account_id, contract_number, sequence_number, template_key, template_version,
    contact_id, conversation_id, catalog_item_id, executive_user_id,
    consignor_name, vehicle_label, issue_date, payload,
    created_by_user_id, updated_by_user_id
  ) VALUES (
    v_profile.account_id, v_number, v_sequence, 'payment_commitment_v1', 1,
    v_contact_id, v_conversation_id, v_catalog_item_id, v_executive_user_id,
    trim(p_payload->>'provider_name'), trim(p_payload->>'vehicle_label'),
    COALESCE(NULLIF(p_payload->>'issue_date', '')::DATE, CURRENT_DATE), p_payload,
    auth.uid(), auth.uid()
  ) RETURNING * INTO v_contract;

  INSERT INTO public.contract_events (account_id, contract_id, event_type, actor_user_id, metadata)
  VALUES (v_profile.account_id, v_contract.id, 'created', auth.uid(),
    jsonb_build_object('contract_number', v_contract.contract_number, 'template_key', 'payment_commitment_v1'));
  RETURN v_contract;
END;
$$;

ALTER FUNCTION public.create_payment_commitment_contract(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_payment_commitment_contract(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_payment_commitment_contract(JSONB) TO authenticated;
