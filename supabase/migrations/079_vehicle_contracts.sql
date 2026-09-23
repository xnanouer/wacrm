-- ============================================================================
-- 079_vehicle_contracts.sql
--
-- Central company legal profile plus the first Nexora contract workflow:
-- vehicle reception / consignment. Every record is account-scoped and every
-- generated version stores an immutable snapshot of the document data.
-- ============================================================================

SET search_path = public, pg_catalog;

-- --------------------------------------------------------------------------
-- One authoritative legal profile per company.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_legal_profiles (
  account_id                 UUID PRIMARY KEY
                             REFERENCES public.accounts(id) ON DELETE CASCADE,
  legal_name                 TEXT NOT NULL DEFAULT '' CHECK (length(legal_name) <= 180),
  trade_name                 TEXT NOT NULL DEFAULT '' CHECK (length(trade_name) <= 180),
  tax_id                     TEXT CHECK (tax_id IS NULL OR length(tax_id) <= 30),
  business_activity          TEXT CHECK (business_activity IS NULL OR length(business_activity) <= 240),
  legal_address              TEXT CHECK (legal_address IS NULL OR length(legal_address) <= 300),
  commune                    TEXT CHECK (commune IS NULL OR length(commune) <= 120),
  city                       TEXT CHECK (city IS NULL OR length(city) <= 120),
  region                     TEXT CHECK (region IS NULL OR length(region) <= 120),
  phone                      TEXT CHECK (phone IS NULL OR length(phone) <= 40),
  email                      TEXT CHECK (email IS NULL OR length(email) <= 160),
  legal_representative_name  TEXT CHECK (legal_representative_name IS NULL OR length(legal_representative_name) <= 180),
  legal_representative_tax_id TEXT CHECK (legal_representative_tax_id IS NULL OR length(legal_representative_tax_id) <= 30),
  default_branch_name        TEXT CHECK (default_branch_name IS NULL OR length(default_branch_name) <= 160),
  default_branch_address     TEXT CHECK (default_branch_address IS NULL OR length(default_branch_address) <= 300),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.account_legal_profiles (
  account_id, legal_name, trade_name, tax_id, legal_address, phone, email
)
SELECT
  account.id,
  account.name,
  account.name,
  quotation.company_rut,
  quotation.company_address,
  quotation.company_phone,
  quotation.company_email
FROM public.accounts account
LEFT JOIN public.quotation_settings quotation ON quotation.account_id = account.id
ON CONFLICT (account_id) DO NOTHING;

DROP TRIGGER IF EXISTS set_updated_at ON public.account_legal_profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.account_legal_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --------------------------------------------------------------------------
-- Account-specific numbering and defaults.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_settings (
  account_id            UUID PRIMARY KEY
                        REFERENCES public.accounts(id) ON DELETE CASCADE,
  contract_prefix       TEXT NOT NULL DEFAULT 'CON'
                        CHECK (contract_prefix ~ '^[A-Z0-9]{1,12}$'),
  sequence_digits       SMALLINT NOT NULL DEFAULT 6
                        CHECK (sequence_digits BETWEEN 3 AND 10),
  next_sequence         BIGINT NOT NULL DEFAULT 1 CHECK (next_sequence > 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.contract_settings (account_id)
SELECT id FROM public.accounts
ON CONFLICT (account_id) DO NOTHING;

DROP TRIGGER IF EXISTS set_updated_at ON public.contract_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.contract_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.bootstrap_contract_account_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.account_legal_profiles (
    account_id, legal_name, trade_name
  ) VALUES (NEW.id, NEW.name, NEW.name)
  ON CONFLICT (account_id) DO NOTHING;
  INSERT INTO public.contract_settings (account_id)
  VALUES (NEW.id)
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.bootstrap_contract_account_settings() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.bootstrap_contract_account_settings() FROM PUBLIC;
DROP TRIGGER IF EXISTS bootstrap_contract_account_settings ON public.accounts;
CREATE TRIGGER bootstrap_contract_account_settings
  AFTER INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_contract_account_settings();

-- --------------------------------------------------------------------------
-- Contract drafts and immutable generated versions.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contracts (
  id                    UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contract_number       TEXT NOT NULL CHECK (length(contract_number) BETWEEN 4 AND 32),
  sequence_number       BIGINT NOT NULL CHECK (sequence_number > 0),
  template_key          TEXT NOT NULL DEFAULT 'vehicle_consignment_v1'
                        CHECK (template_key IN ('vehicle_consignment_v1')),
  template_version      SMALLINT NOT NULL DEFAULT 1 CHECK (template_version > 0),
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'generated', 'signed', 'cancelled')),
  contact_id            UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id       UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  catalog_item_id       UUID REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  executive_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consignor_name        TEXT NOT NULL CHECK (length(trim(consignor_name)) BETWEEN 1 AND 180),
  vehicle_label         TEXT NOT NULL CHECK (length(trim(vehicle_label)) BETWEEN 1 AND 240),
  issue_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_version       INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  generated_at          TIMESTAMPTZ,
  created_by_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contracts_number_unique UNIQUE (account_id, contract_number),
  CONSTRAINT contracts_sequence_unique UNIQUE (account_id, sequence_number),
  CONSTRAINT contracts_id_account_unique UNIQUE (id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_contracts_account_updated
  ON public.contracts(account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_contact
  ON public.contracts(account_id, contact_id, updated_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.contracts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.contract_versions (
  id                    UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id            UUID NOT NULL,
  contract_id           UUID NOT NULL,
  version_number        INTEGER NOT NULL CHECK (version_number > 0),
  snapshot              JSONB NOT NULL,
  generation_status     TEXT NOT NULL DEFAULT 'pending'
                        CHECK (generation_status IN ('pending', 'ready', 'failed')),
  generation_error      TEXT,
  pdf_storage_path      TEXT,
  pdf_sha256            TEXT CHECK (pdf_sha256 IS NULL OR pdf_sha256 ~ '^[a-f0-9]{64}$'),
  generated_by_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contract_versions_contract_account_fkey
    FOREIGN KEY (contract_id, account_id)
    REFERENCES public.contracts(id, account_id) ON DELETE CASCADE,
  CONSTRAINT contract_versions_unique UNIQUE (contract_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_contract_versions_contract_created
  ON public.contract_versions(contract_id, version_number DESC);

CREATE TABLE IF NOT EXISTS public.contract_events (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id      UUID NOT NULL,
  contract_id     UUID NOT NULL,
  event_type      TEXT NOT NULL CHECK (event_type IN (
                    'created', 'updated', 'generated', 'signed', 'cancelled'
                  )),
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contract_events_contract_account_fkey
    FOREIGN KEY (contract_id, account_id)
    REFERENCES public.contracts(id, account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contract_events_contract_created
  ON public.contract_events(contract_id, created_at DESC);

-- --------------------------------------------------------------------------
-- Permission helpers mirror the quotation workflow.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_contract(target_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contracts contract
    JOIN public.profiles profile
      ON profile.user_id = auth.uid()
     AND profile.account_id = contract.account_id
    WHERE contract.id = target_contract_id
      AND (
        profile.account_role::TEXT IN ('owner', 'admin', 'viewer')
        OR contract.created_by_user_id = auth.uid()
        OR contract.executive_user_id = auth.uid()
        OR (
          contract.conversation_id IS NOT NULL
          AND public.can_view_ticket(contract.conversation_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_contract(target_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contracts contract
    JOIN public.profiles profile
      ON profile.user_id = auth.uid()
     AND profile.account_id = contract.account_id
    WHERE contract.id = target_contract_id
      AND profile.account_role::TEXT <> 'viewer'
      AND (
        profile.account_role::TEXT IN ('owner', 'admin')
        OR contract.created_by_user_id = auth.uid()
        OR contract.executive_user_id = auth.uid()
        OR (
          contract.conversation_id IS NOT NULL
          AND public.can_operate_ticket(contract.conversation_id)
        )
      )
  );
$$;

ALTER FUNCTION public.can_view_contract(UUID) OWNER TO postgres;
ALTER FUNCTION public.can_manage_contract(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_view_contract(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_contract(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_contract(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_contract(UUID) TO authenticated, service_role;

-- Atomic number allocation and draft creation.
CREATE OR REPLACE FUNCTION public.create_vehicle_consignment_contract(p_payload JSONB)
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

  INSERT INTO public.contract_settings (account_id)
  VALUES (v_profile.account_id)
  ON CONFLICT (account_id) DO NOTHING;

  SELECT * INTO v_settings
  FROM public.contract_settings
  WHERE account_id = v_profile.account_id
  FOR UPDATE;

  v_sequence := v_settings.next_sequence;
  v_number := v_settings.contract_prefix || '-' ||
    lpad(v_sequence::TEXT, v_settings.sequence_digits, '0');
  UPDATE public.contract_settings
  SET next_sequence = next_sequence + 1
  WHERE account_id = v_profile.account_id;

  v_contact_id := NULLIF(p_payload->>'contact_id', '')::UUID;
  v_conversation_id := NULLIF(p_payload->>'conversation_id', '')::UUID;
  v_catalog_item_id := NULLIF(p_payload->>'catalog_item_id', '')::UUID;
  v_executive_user_id := COALESCE(
    NULLIF(p_payload->>'executive_user_id', '')::UUID,
    auth.uid()
  );

  IF v_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts contact
    WHERE contact.id = v_contact_id AND contact.account_id = v_profile.account_id
  ) THEN
    RAISE EXCEPTION 'contract_contact_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_catalog_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.catalog_items item
    WHERE item.id = v_catalog_item_id AND item.account_id = v_profile.account_id
  ) THEN
    RAISE EXCEPTION 'contract_catalog_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations conversation
    WHERE conversation.id = v_conversation_id
      AND conversation.account_id = v_profile.account_id
      AND (v_contact_id IS NULL OR conversation.contact_id = v_contact_id)
      AND public.can_operate_ticket(conversation.id)
  ) THEN
    RAISE EXCEPTION 'contract_conversation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.user_id = v_executive_user_id
      AND profile.account_id = v_profile.account_id
  ) THEN
    RAISE EXCEPTION 'contract_executive_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.contracts (
    account_id, contract_number, sequence_number, contact_id,
    conversation_id, catalog_item_id, executive_user_id, consignor_name,
    vehicle_label, issue_date, payload, created_by_user_id, updated_by_user_id
  ) VALUES (
    v_profile.account_id,
    v_number,
    v_sequence,
    v_contact_id,
    v_conversation_id,
    v_catalog_item_id,
    v_executive_user_id,
    trim(p_payload->>'consignor_name'),
    trim(p_payload->>'vehicle_label'),
    COALESCE(NULLIF(p_payload->>'issue_date', '')::DATE, CURRENT_DATE),
    p_payload,
    auth.uid(),
    auth.uid()
  ) RETURNING * INTO v_contract;

  INSERT INTO public.contract_events (
    account_id, contract_id, event_type, actor_user_id, metadata
  ) VALUES (
    v_profile.account_id, v_contract.id, 'created', auth.uid(),
    jsonb_build_object('contract_number', v_contract.contract_number)
  );

  RETURN v_contract;
END;
$$;

ALTER FUNCTION public.create_vehicle_consignment_contract(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_vehicle_consignment_contract(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_vehicle_consignment_contract(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_contract_version(
  p_contract_id UUID,
  p_snapshot JSONB
) RETURNS public.contract_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_version public.contract_versions%ROWTYPE;
  v_number INTEGER;
BEGIN
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_contract(v_contract.id) THEN
    RAISE EXCEPTION 'contract_generate_forbidden' USING ERRCODE = '42501';
  END IF;

  v_number := v_contract.current_version + 1;
  INSERT INTO public.contract_versions (
    account_id, contract_id, version_number, snapshot, generated_by_user_id
  ) VALUES (
    v_contract.account_id, v_contract.id, v_number, p_snapshot, auth.uid()
  ) RETURNING * INTO v_version;

  UPDATE public.contracts
  SET current_version = v_number,
      status = CASE WHEN status = 'draft' THEN 'generated' ELSE status END,
      generated_at = NOW(),
      updated_by_user_id = auth.uid()
  WHERE id = v_contract.id;

  INSERT INTO public.contract_events (
    account_id, contract_id, event_type, actor_user_id, metadata
  ) VALUES (
    v_contract.account_id, v_contract.id, 'generated', auth.uid(),
    jsonb_build_object('version', v_number)
  );

  RETURN v_version;
END;
$$;

ALTER FUNCTION public.reserve_contract_version(UUID, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reserve_contract_version(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_contract_version(UUID, JSONB) TO authenticated;

-- --------------------------------------------------------------------------
-- Row-level security.
-- --------------------------------------------------------------------------
ALTER TABLE public.account_legal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_legal_profiles_select ON public.account_legal_profiles
  FOR SELECT USING (public.is_account_member(account_id, 'agent'));
CREATE POLICY account_legal_profiles_insert ON public.account_legal_profiles
  FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY account_legal_profiles_update ON public.account_legal_profiles
  FOR UPDATE USING (public.is_account_member(account_id, 'admin'))
  WITH CHECK (public.is_account_member(account_id, 'admin'));

CREATE POLICY contract_settings_select ON public.contract_settings
  FOR SELECT USING (public.is_account_member(account_id, 'agent'));
CREATE POLICY contract_settings_insert ON public.contract_settings
  FOR INSERT WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY contract_settings_update ON public.contract_settings
  FOR UPDATE USING (public.is_account_member(account_id, 'admin'))
  WITH CHECK (public.is_account_member(account_id, 'admin'));

CREATE POLICY contracts_select ON public.contracts
  FOR SELECT USING (public.can_view_contract(id));
CREATE POLICY contracts_insert ON public.contracts
  FOR INSERT WITH CHECK (
    public.is_account_member(account_id, 'agent')
    AND created_by_user_id = auth.uid()
    AND updated_by_user_id = auth.uid()
  );
CREATE POLICY contracts_update ON public.contracts
  FOR UPDATE USING (public.can_manage_contract(id))
  WITH CHECK (public.can_manage_contract(id));
CREATE POLICY contracts_delete ON public.contracts
  FOR DELETE USING (
    public.current_account_role(account_id) IN ('owner', 'admin')
    OR (created_by_user_id = auth.uid() AND status = 'draft')
  );

CREATE POLICY contract_versions_select ON public.contract_versions
  FOR SELECT USING (public.can_view_contract(contract_id));
CREATE POLICY contract_versions_insert ON public.contract_versions
  FOR INSERT WITH CHECK (public.can_manage_contract(contract_id));
CREATE POLICY contract_versions_update ON public.contract_versions
  FOR UPDATE USING (public.can_manage_contract(contract_id))
  WITH CHECK (public.can_manage_contract(contract_id));

CREATE POLICY contract_events_select ON public.contract_events
  FOR SELECT USING (public.can_view_contract(contract_id));
CREATE POLICY contract_events_insert ON public.contract_events
  FOR INSERT WITH CHECK (public.can_manage_contract(contract_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_legal_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contract_versions TO authenticated;
GRANT SELECT, INSERT ON public.contract_events TO authenticated;

-- --------------------------------------------------------------------------
-- Private PDF artifacts.
-- Required path: account-<account_id>/contracts/<contract_id>/<version>/<file>
-- --------------------------------------------------------------------------
INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) VALUES (
  'contract-documents', 'contract-documents', FALSE, 20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Contract documents authorized read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'contract-documents'
    AND (storage.foldername(name))[2] = 'contracts'
    AND EXISTS (
      SELECT 1 FROM public.contracts contract
      WHERE ('account-' || contract.account_id::TEXT) = (storage.foldername(name))[1]
        AND contract.id::TEXT = (storage.foldername(name))[3]
        AND public.can_view_contract(contract.id)
    )
  );

CREATE POLICY "Contract documents authorized upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'contract-documents'
    AND (storage.foldername(name))[2] = 'contracts'
    AND array_length(storage.foldername(name), 1) = 4
    AND (storage.foldername(name))[4] ~ '^[1-9][0-9]*$'
    AND EXISTS (
      SELECT 1 FROM public.contracts contract
      WHERE ('account-' || contract.account_id::TEXT) = (storage.foldername(name))[1]
        AND contract.id::TEXT = (storage.foldername(name))[3]
        AND public.can_manage_contract(contract.id)
    )
  );

CREATE POLICY "Contract documents authorized update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'contract-documents'
    AND EXISTS (
      SELECT 1 FROM public.contracts contract
      WHERE ('account-' || contract.account_id::TEXT) = (storage.foldername(name))[1]
        AND contract.id::TEXT = (storage.foldername(name))[3]
        AND public.can_manage_contract(contract.id)
    )
  );

CREATE POLICY "Contract documents authorized delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'contract-documents'
    AND EXISTS (
      SELECT 1 FROM public.contracts contract
      WHERE ('account-' || contract.account_id::TEXT) = (storage.foldername(name))[1]
        AND contract.id::TEXT = (storage.foldername(name))[3]
        AND public.can_manage_contract(contract.id)
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contracts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contracts;
  END IF;
END;
$$;
