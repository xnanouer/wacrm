-- ============================================================================
-- 059_vehicle_quotations.sql
--
-- Production foundation for account-scoped vehicle quotations:
-- settings, atomic numbering, snapshots, versions, sends, audit events,
-- private artifacts and chat-message traceability.
-- ============================================================================

SET search_path = public, pg_catalog;

-- Composite keys used by tenant-safe foreign keys below.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_user_account_unique'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_account_unique UNIQUE (user_id, account_id);
  END IF;
END;
$$;

-- --------------------------------------------------------------------------
-- Account settings and numbering state.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quotation_settings (
  account_id                  UUID PRIMARY KEY
                              REFERENCES public.accounts(id) ON DELETE CASCADE,
  quote_prefix                TEXT NOT NULL DEFAULT 'NX'
                              CHECK (quote_prefix ~ '^[A-Z0-9]{1,12}$'),
  sequence_digits             SMALLINT NOT NULL DEFAULT 6
                              CHECK (sequence_digits BETWEEN 3 AND 10),
  next_sequence               BIGINT NOT NULL DEFAULT 1 CHECK (next_sequence > 0),
  default_validity_days       SMALLINT NOT NULL DEFAULT 30
                              CHECK (default_validity_days BETWEEN 1 AND 365),
  currency_code               TEXT NOT NULL DEFAULT 'CLP'
                              CHECK (currency_code ~ '^[A-Z]{3}$'),
  company_display_name        TEXT NOT NULL DEFAULT 'Nexora CRM'
                              CHECK (length(trim(company_display_name)) BETWEEN 1 AND 120),
  company_rut                 TEXT CHECK (company_rut IS NULL OR length(company_rut) <= 30),
  company_phone               TEXT CHECK (company_phone IS NULL OR length(company_phone) <= 40),
  company_email               TEXT CHECK (company_email IS NULL OR length(company_email) <= 160),
  company_address             TEXT CHECK (company_address IS NULL OR length(company_address) <= 300),
  logo_url                    TEXT CHECK (logo_url IS NULL OR length(logo_url) <= 2000),
  primary_color               TEXT NOT NULL DEFAULT '#6D28D9'
                              CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color                TEXT NOT NULL DEFAULT '#8B5CF6'
                              CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  show_client_rut             BOOLEAN NOT NULL DEFAULT TRUE,
  show_client_email           BOOLEAN NOT NULL DEFAULT TRUE,
  show_vehicle_plate          BOOLEAN NOT NULL DEFAULT FALSE,
  show_executive_phone        BOOLEAN NOT NULL DEFAULT TRUE,
  show_executive_email        BOOLEAN NOT NULL DEFAULT TRUE,
  default_terms               TEXT NOT NULL DEFAULT
    'Cotización referencial sujeta a disponibilidad del vehículo, evaluación crediticia y aprobación de la entidad financiera. Los valores pueden variar según antecedentes comerciales, seguros y gastos operacionales.'
                              CHECK (length(default_terms) <= 5000),
  message_template            TEXT NOT NULL DEFAULT
    'Hola {{cliente}}, te comparto la cotización {{numero}} del {{vehiculo}}. Tiene vigencia hasta el {{vigencia}}.'
                              CHECK (length(message_template) BETWEEN 1 AND 2000),
  default_attachment_format   TEXT NOT NULL DEFAULT 'pdf'
                              CHECK (default_attachment_format IN ('pdf', 'png', 'both')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.quotation_settings (account_id, company_display_name)
SELECT account.id, COALESCE(NULLIF(trim(account.name), ''), 'Nexora CRM')
FROM public.accounts account
ON CONFLICT (account_id) DO NOTHING;

DROP TRIGGER IF EXISTS set_updated_at ON public.quotation_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.quotation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --------------------------------------------------------------------------
-- Quotations. Monetary values are integer CLP amounts.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quotations (
  id                         UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id                 UUID NOT NULL
                             REFERENCES public.accounts(id) ON DELETE CASCADE,
  quote_number               TEXT NOT NULL CHECK (length(quote_number) BETWEEN 4 AND 32),
  sequence_number            BIGINT NOT NULL CHECK (sequence_number > 0),
  current_version            INTEGER NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  status                     TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN (
                               'draft', 'generated', 'sent', 'negotiating',
                               'financing_pending', 'accepted', 'rejected',
                               'expired', 'contract_completed', 'cancelled'
                             )),
  contact_id                 UUID,
  conversation_id            UUID,
  catalog_item_id            UUID,
  executive_user_id          UUID,
  executive_name             TEXT NOT NULL CHECK (length(trim(executive_name)) BETWEEN 1 AND 160),
  executive_phone            TEXT NOT NULL DEFAULT '' CHECK (length(executive_phone) <= 40),
  executive_email            TEXT NOT NULL DEFAULT '' CHECK (length(executive_email) <= 160),
  client_name                TEXT NOT NULL CHECK (length(trim(client_name)) BETWEEN 1 AND 160),
  client_rut                 TEXT CHECK (client_rut IS NULL OR length(client_rut) <= 30),
  client_phone               TEXT NOT NULL CHECK (length(trim(client_phone)) BETWEEN 5 AND 40),
  client_email               TEXT CHECK (client_email IS NULL OR length(client_email) <= 160),
  client_city                TEXT CHECK (client_city IS NULL OR length(client_city) <= 160),
  vehicle_make               TEXT NOT NULL CHECK (length(trim(vehicle_make)) BETWEEN 1 AND 80),
  vehicle_model              TEXT NOT NULL CHECK (length(trim(vehicle_model)) BETWEEN 1 AND 80),
  vehicle_version            TEXT NOT NULL DEFAULT '' CHECK (length(vehicle_version) <= 120),
  vehicle_year               SMALLINT CHECK (vehicle_year IS NULL OR vehicle_year BETWEEN 1886 AND 2200),
  vehicle_color              TEXT NOT NULL DEFAULT '' CHECK (length(vehicle_color) <= 80),
  vehicle_fuel               TEXT NOT NULL DEFAULT '' CHECK (length(vehicle_fuel) <= 80),
  vehicle_transmission       TEXT NOT NULL DEFAULT '' CHECK (length(vehicle_transmission) <= 80),
  vehicle_drivetrain         TEXT NOT NULL DEFAULT '' CHECK (length(vehicle_drivetrain) <= 80),
  vehicle_mileage_km         BIGINT NOT NULL DEFAULT 0 CHECK (vehicle_mileage_km >= 0),
  vehicle_plate              TEXT CHECK (vehicle_plate IS NULL OR length(vehicle_plate) <= 30),
  vehicle_image_url          TEXT CHECK (vehicle_image_url IS NULL OR length(vehicle_image_url) <= 3000),
  purchase_type              TEXT NOT NULL DEFAULT 'financed'
                             CHECK (purchase_type IN ('cash', 'financed')),
  list_price                 BIGINT NOT NULL CHECK (list_price >= 0),
  discount_amount            BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  final_price                BIGINT GENERATED ALWAYS AS
                             (list_price - discount_amount) STORED,
  down_payment               BIGINT NOT NULL DEFAULT 0 CHECK (down_payment >= 0),
  financed_expenses          BIGINT NOT NULL DEFAULT 0 CHECK (financed_expenses >= 0),
  amount_to_finance          BIGINT GENERATED ALWAYS AS
                             (list_price - discount_amount - down_payment + financed_expenses) STORED,
  issue_date                 DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until                DATE NOT NULL,
  document_notes             TEXT NOT NULL DEFAULT '' CHECK (length(document_notes) <= 5000),
  internal_notes             TEXT NOT NULL DEFAULT '' CHECK (length(internal_notes) <= 10000),
  terms_text                 TEXT NOT NULL DEFAULT '' CHECK (length(terms_text) <= 5000),
  message_text               TEXT NOT NULL DEFAULT '' CHECK (length(message_text) <= 2000),
  generated_at               TIMESTAMPTZ,
  last_sent_at               TIMESTAMPTZ,
  accepted_at                TIMESTAMPTZ,
  rejected_at                TIMESTAMPTZ,
  completed_at               TIMESTAMPTZ,
  deletion_hold              BOOLEAN NOT NULL DEFAULT FALSE,
  deletion_hold_reason       TEXT CHECK (deletion_hold_reason IS NULL OR length(deletion_hold_reason) <= 500),
  retention_warned_at        TIMESTAMPTZ,
  created_by_user_id         UUID NOT NULL,
  updated_by_user_id         UUID NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotations_id_account_unique UNIQUE (id, account_id),
  CONSTRAINT quotations_account_number_unique UNIQUE (account_id, quote_number),
  CONSTRAINT quotations_account_sequence_unique UNIQUE (account_id, sequence_number),
  CONSTRAINT quotations_contact_account_fkey
    FOREIGN KEY (contact_id, account_id)
    REFERENCES public.contacts(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT quotations_conversation_account_fkey
    FOREIGN KEY (conversation_id, account_id)
    REFERENCES public.conversations(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT quotations_catalog_account_fkey
    FOREIGN KEY (catalog_item_id, account_id)
    REFERENCES public.catalog_items(id, account_id)
    ON DELETE SET NULL (catalog_item_id),
  CONSTRAINT quotations_executive_account_fkey
    FOREIGN KEY (executive_user_id, account_id)
    REFERENCES public.profiles(user_id, account_id)
    ON DELETE SET NULL (executive_user_id),
  CONSTRAINT quotations_created_by_account_fkey
    FOREIGN KEY (created_by_user_id, account_id)
    REFERENCES public.profiles(user_id, account_id) ON DELETE RESTRICT,
  CONSTRAINT quotations_updated_by_account_fkey
    FOREIGN KEY (updated_by_user_id, account_id)
    REFERENCES public.profiles(user_id, account_id) ON DELETE RESTRICT,
  CONSTRAINT quotations_dates_check CHECK (valid_until >= issue_date),
  CONSTRAINT quotations_discount_check CHECK (discount_amount <= list_price),
  CONSTRAINT quotations_down_payment_final_check CHECK (down_payment <= final_price),
  CONSTRAINT quotations_finance_amount_check CHECK (amount_to_finance >= 0),
  CONSTRAINT quotations_purchase_finance_check CHECK (
    (purchase_type = 'cash' AND down_payment = 0 AND financed_expenses = 0)
    OR purchase_type = 'financed'
  ),
  CONSTRAINT quotations_hold_reason_check CHECK (
    NOT deletion_hold OR length(trim(COALESCE(deletion_hold_reason, ''))) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_quotations_account_updated
  ON public.quotations(account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_account_status_updated
  ON public.quotations(account_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_contact_updated
  ON public.quotations(account_id, contact_id, updated_at DESC)
  WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_conversation_updated
  ON public.quotations(conversation_id, updated_at DESC)
  WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_creator_updated
  ON public.quotations(account_id, created_by_user_id, updated_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.quotations;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.quotation_installment_options (
  id                    UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id            UUID NOT NULL,
  quotation_id          UUID NOT NULL,
  term_months           SMALLINT NOT NULL CHECK (term_months BETWEEN 1 AND 120),
  monthly_payment       BIGINT NOT NULL CHECK (monthly_payment >= 0),
  observation           TEXT NOT NULL DEFAULT 'Referencial'
                        CHECK (length(observation) <= 300),
  sort_order            SMALLINT NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotation_installments_quote_account_fkey
    FOREIGN KEY (quotation_id, account_id)
    REFERENCES public.quotations(id, account_id) ON DELETE CASCADE,
  CONSTRAINT quotation_installments_unique_term
    UNIQUE (quotation_id, term_months),
  CONSTRAINT quotation_installments_unique_order
    UNIQUE (quotation_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_quotation_installments_quote
  ON public.quotation_installment_options(quotation_id, sort_order);

CREATE TABLE IF NOT EXISTS public.quotation_versions (
  id                    UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id            UUID NOT NULL,
  quotation_id          UUID NOT NULL,
  version_number        INTEGER NOT NULL CHECK (version_number > 0),
  snapshot              JSONB NOT NULL,
  generation_status     TEXT NOT NULL DEFAULT 'pending'
                        CHECK (generation_status IN ('pending', 'ready', 'failed')),
  generation_error      TEXT CHECK (generation_error IS NULL OR length(generation_error) <= 2000),
  pdf_storage_path      TEXT CHECK (pdf_storage_path IS NULL OR length(pdf_storage_path) <= 1000),
  png_storage_path      TEXT CHECK (png_storage_path IS NULL OR length(png_storage_path) <= 1000),
  pdf_sha256            TEXT CHECK (pdf_sha256 IS NULL OR pdf_sha256 ~ '^[0-9a-f]{64}$'),
  png_sha256            TEXT CHECK (png_sha256 IS NULL OR png_sha256 ~ '^[0-9a-f]{64}$'),
  generated_by_user_id  UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotation_versions_quote_account_fkey
    FOREIGN KEY (quotation_id, account_id)
    REFERENCES public.quotations(id, account_id) ON DELETE CASCADE,
  CONSTRAINT quotation_versions_generator_account_fkey
    FOREIGN KEY (generated_by_user_id, account_id)
    REFERENCES public.profiles(user_id, account_id) ON DELETE RESTRICT,
  CONSTRAINT quotation_versions_unique UNIQUE (quotation_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_quotation_versions_quote_created
  ON public.quotation_versions(quotation_id, version_number DESC);

CREATE TABLE IF NOT EXISTS public.quotation_sends (
  id                    UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id            UUID NOT NULL,
  quotation_id          UUID NOT NULL,
  quotation_version_id  UUID,
  conversation_id       UUID NOT NULL,
  idempotency_key       TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 160),
  attachment_format     TEXT NOT NULL CHECK (attachment_format IN ('pdf', 'png', 'both')),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sending', 'sent', 'partial', 'failed')),
  text_message_id       UUID,
  pdf_message_id        UUID,
  png_message_id        UUID,
  error_code            TEXT CHECK (error_code IS NULL OR length(error_code) <= 100),
  error_message         TEXT CHECK (error_message IS NULL OR length(error_message) <= 2000),
  requested_by_user_id  UUID NOT NULL,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotation_sends_quote_account_fkey
    FOREIGN KEY (quotation_id, account_id)
    REFERENCES public.quotations(id, account_id) ON DELETE CASCADE,
  CONSTRAINT quotation_sends_version_fkey
    FOREIGN KEY (quotation_version_id)
    REFERENCES public.quotation_versions(id) ON DELETE RESTRICT,
  CONSTRAINT quotation_sends_conversation_account_fkey
    FOREIGN KEY (conversation_id, account_id)
    REFERENCES public.conversations(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT quotation_sends_requester_account_fkey
    FOREIGN KEY (requested_by_user_id, account_id)
    REFERENCES public.profiles(user_id, account_id) ON DELETE RESTRICT,
  CONSTRAINT quotation_sends_idempotency_unique UNIQUE (account_id, idempotency_key)
);

DROP TRIGGER IF EXISTS set_updated_at ON public.quotation_sends;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.quotation_sends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_quotation_sends_quote_created
  ON public.quotation_sends(quotation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.quotation_events (
  id                    UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id            UUID NOT NULL,
  quotation_id          UUID NOT NULL,
  event_type            TEXT NOT NULL CHECK (event_type IN (
                          'created', 'updated', 'generated', 'versioned',
                          'sent', 'resent', 'status_changed', 'duplicated',
                          'hold_enabled', 'hold_disabled', 'retention_warning'
                        )),
  actor_user_id         UUID,
  from_status           TEXT,
  to_status             TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotation_events_quote_account_fkey
    FOREIGN KEY (quotation_id, account_id)
    REFERENCES public.quotations(id, account_id) ON DELETE CASCADE,
  CONSTRAINT quotation_events_actor_account_fkey
    FOREIGN KEY (actor_user_id, account_id)
    REFERENCES public.profiles(user_id, account_id)
    ON DELETE SET NULL (actor_user_id)
);

CREATE INDEX IF NOT EXISTS idx_quotation_events_quote_created
  ON public.quotation_events(quotation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotation_events_account_type
  ON public.quotation_events(account_id, event_type, created_at DESC);

-- Sent quotation attachments remain normal chat messages, with explicit
-- traceability back to the exact quote version rendered in the bubble.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS quotation_id UUID,
  ADD COLUMN IF NOT EXISTS quotation_version_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_quotation_id_fkey'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_quotation_id_fkey
      FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_quotation_version_id_fkey'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_quotation_version_id_fkey
      FOREIGN KEY (quotation_version_id)
      REFERENCES public.quotation_versions(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_messages_quotation
  ON public.messages(quotation_id, created_at DESC)
  WHERE quotation_id IS NOT NULL;

-- A message can only reference a quotation from the same company and, when a
-- version is present, that version must belong to the referenced quotation.
-- This closes a cross-tenant reference gap even if an authenticated client
-- attempts to update a message directly through the Supabase API.
CREATE OR REPLACE FUNCTION public.validate_message_quotation_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.quotation_id IS NULL AND NEW.quotation_version_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.quotation_id IS NULL THEN
    RAISE EXCEPTION 'message_quotation_required' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations conversation
    JOIN public.quotations quotation
      ON quotation.id = NEW.quotation_id
     AND quotation.account_id = conversation.account_id
    LEFT JOIN public.quotation_versions version
      ON version.id = NEW.quotation_version_id
     AND version.quotation_id = quotation.id
     AND version.account_id = quotation.account_id
    WHERE conversation.id = NEW.conversation_id
      AND (NEW.quotation_version_id IS NULL OR version.id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'message_quotation_scope_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.validate_message_quotation_scope() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_message_quotation_scope() FROM PUBLIC;

DROP TRIGGER IF EXISTS validate_message_quotation_scope ON public.messages;
CREATE TRIGGER validate_message_quotation_scope
  BEFORE INSERT OR UPDATE OF conversation_id, quotation_id, quotation_version_id
  ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_message_quotation_scope();

-- --------------------------------------------------------------------------
-- Authorization helpers.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_quotation(target_quotation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.quotations quote
    JOIN public.profiles profile
      ON profile.user_id = auth.uid()
     AND profile.account_id = quote.account_id
    WHERE quote.id = target_quotation_id
      AND (
        profile.account_role::TEXT IN ('owner', 'admin', 'viewer')
        OR quote.created_by_user_id = auth.uid()
        OR quote.executive_user_id = auth.uid()
        OR (
          quote.conversation_id IS NOT NULL
          AND public.can_view_ticket(quote.conversation_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_quotation(target_quotation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.quotations quote
    JOIN public.profiles profile
      ON profile.user_id = auth.uid()
     AND profile.account_id = quote.account_id
    WHERE quote.id = target_quotation_id
      AND profile.account_role::TEXT <> 'viewer'
      AND (
        profile.account_role::TEXT IN ('owner', 'admin')
        OR quote.created_by_user_id = auth.uid()
        OR quote.executive_user_id = auth.uid()
        OR (
          quote.conversation_id IS NOT NULL
          AND public.can_operate_ticket(quote.conversation_id)
        )
      )
  );
$$;

ALTER FUNCTION public.can_view_quotation(UUID) OWNER TO postgres;
ALTER FUNCTION public.can_manage_quotation(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_view_quotation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_quotation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_quotation(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_quotation(UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- Atomic per-account draft creation. The settings row is locked while the
-- sequence is allocated, so concurrent agents cannot receive the same number.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_vehicle_quotation(p_payload JSONB)
RETURNS public.quotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_settings public.quotation_settings%ROWTYPE;
  v_quote public.quotations%ROWTYPE;
  v_sequence BIGINT;
  v_number TEXT;
  v_issue_date DATE;
  v_valid_until DATE;
  v_contact_id UUID;
  v_conversation_id UUID;
  v_catalog_item_id UUID;
  v_executive_user_id UUID;
  v_executive_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF NOT FOUND OR NOT public.is_account_member(v_profile.account_id, 'agent') THEN
    RAISE EXCEPTION 'quotation_create_forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.quotation_settings (account_id, company_display_name)
  SELECT v_profile.account_id, COALESCE(NULLIF(trim(account.name), ''), 'Nexora CRM')
  FROM public.accounts account
  WHERE account.id = v_profile.account_id
  ON CONFLICT (account_id) DO NOTHING;

  SELECT * INTO v_settings
  FROM public.quotation_settings
  WHERE account_id = v_profile.account_id
  FOR UPDATE;

  v_sequence := v_settings.next_sequence;
  v_number := v_settings.quote_prefix || '-' ||
    lpad(v_sequence::TEXT, v_settings.sequence_digits, '0');
  UPDATE public.quotation_settings
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
    RAISE EXCEPTION 'quotation_contact_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations conversation
    WHERE conversation.id = v_conversation_id
      AND conversation.account_id = v_profile.account_id
      AND (v_contact_id IS NULL OR conversation.contact_id = v_contact_id)
      AND public.can_operate_ticket(conversation.id)
  ) THEN
    RAISE EXCEPTION 'quotation_conversation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_catalog_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.catalog_items item
    WHERE item.id = v_catalog_item_id AND item.account_id = v_profile.account_id
  ) THEN
    RAISE EXCEPTION 'quotation_catalog_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_executive_profile
  FROM public.profiles profile
  WHERE profile.user_id = v_executive_user_id
    AND profile.account_id = v_profile.account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation_executive_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_issue_date := COALESCE(NULLIF(p_payload->>'issue_date', '')::DATE, CURRENT_DATE);
  v_valid_until := COALESCE(
    NULLIF(p_payload->>'valid_until', '')::DATE,
    v_issue_date + v_settings.default_validity_days
  );

  INSERT INTO public.quotations (
    account_id, quote_number, sequence_number, contact_id, conversation_id,
    catalog_item_id, executive_user_id, executive_name, executive_phone,
    executive_email, client_name, client_rut, client_phone,
    client_email, client_city, vehicle_make, vehicle_model, vehicle_version,
    vehicle_year, vehicle_color, vehicle_fuel, vehicle_transmission,
    vehicle_drivetrain, vehicle_mileage_km, vehicle_plate, vehicle_image_url,
    purchase_type, list_price, discount_amount, down_payment, financed_expenses,
    issue_date, valid_until, document_notes, internal_notes, terms_text,
    message_text, created_by_user_id, updated_by_user_id
  ) VALUES (
    v_profile.account_id, v_number, v_sequence, v_contact_id, v_conversation_id,
    v_catalog_item_id, v_executive_user_id,
    COALESCE(NULLIF(trim(p_payload->>'executive_name'), ''), v_executive_profile.full_name),
    COALESCE(p_payload->>'executive_phone', ''),
    COALESCE(NULLIF(trim(p_payload->>'executive_email'), ''), v_executive_profile.email),
    trim(p_payload->>'client_name'),
    NULLIF(trim(p_payload->>'client_rut'), ''), trim(p_payload->>'client_phone'),
    NULLIF(trim(p_payload->>'client_email'), ''),
    NULLIF(trim(p_payload->>'client_city'), ''),
    trim(p_payload->>'vehicle_make'), trim(p_payload->>'vehicle_model'),
    COALESCE(p_payload->>'vehicle_version', ''),
    NULLIF(p_payload->>'vehicle_year', '')::SMALLINT,
    COALESCE(p_payload->>'vehicle_color', ''),
    COALESCE(p_payload->>'vehicle_fuel', ''),
    COALESCE(p_payload->>'vehicle_transmission', ''),
    COALESCE(p_payload->>'vehicle_drivetrain', ''),
    COALESCE(NULLIF(p_payload->>'vehicle_mileage_km', '')::BIGINT, 0),
    NULLIF(trim(p_payload->>'vehicle_plate'), ''),
    NULLIF(trim(p_payload->>'vehicle_image_url'), ''),
    COALESCE(NULLIF(p_payload->>'purchase_type', ''), 'financed'),
    COALESCE(NULLIF(p_payload->>'list_price', '')::BIGINT, 0),
    COALESCE(NULLIF(p_payload->>'discount_amount', '')::BIGINT, 0),
    COALESCE(NULLIF(p_payload->>'down_payment', '')::BIGINT, 0),
    COALESCE(NULLIF(p_payload->>'financed_expenses', '')::BIGINT, 0),
    v_issue_date, v_valid_until,
    COALESCE(p_payload->>'document_notes', ''),
    COALESCE(p_payload->>'internal_notes', ''),
    COALESCE(NULLIF(p_payload->>'terms_text', ''), v_settings.default_terms),
    COALESCE(p_payload->>'message_text', ''),
    auth.uid(), auth.uid()
  ) RETURNING * INTO v_quote;

  IF v_quote.purchase_type = 'financed' THEN
    IF jsonb_typeof(p_payload->'installments') <> 'array'
       OR jsonb_array_length(p_payload->'installments') = 0 THEN
      RAISE EXCEPTION 'quotation_installment_required' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.quotation_installment_options (
      account_id, quotation_id, term_months, monthly_payment,
      observation, sort_order
    )
    SELECT
      v_profile.account_id,
      v_quote.id,
      (entry.value->>'term_months')::SMALLINT,
      (entry.value->>'monthly_payment')::BIGINT,
      COALESCE(NULLIF(trim(entry.value->>'observation'), ''), 'Referencial'),
      (entry.ordinality - 1)::SMALLINT
    FROM jsonb_array_elements(p_payload->'installments')
      WITH ORDINALITY AS entry(value, ordinality);
  END IF;

  INSERT INTO public.quotation_events (
    account_id, quotation_id, event_type, actor_user_id, to_status, metadata
  ) VALUES (
    v_profile.account_id, v_quote.id, 'created', auth.uid(), 'draft',
    jsonb_build_object('quote_number', v_quote.quote_number)
  );

  RETURN v_quote;
END;
$$;

ALTER FUNCTION public.create_vehicle_quotation(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_vehicle_quotation(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_vehicle_quotation(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_vehicle_quotation(
  p_quotation_id UUID,
  p_payload JSONB
) RETURNS public.quotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_executive public.profiles%ROWTYPE;
  v_contact_id UUID;
  v_conversation_id UUID;
  v_catalog_item_id UUID;
  v_executive_user_id UUID;
BEGIN
  SELECT * INTO v_quote
  FROM public.quotations
  WHERE id = p_quotation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_quotation(v_quote.id) THEN
    RAISE EXCEPTION 'quotation_update_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_quote.status IN ('contract_completed', 'cancelled') THEN
    RAISE EXCEPTION 'quotation_terminal_state' USING ERRCODE = 'P0001';
  END IF;

  v_contact_id := NULLIF(p_payload->>'contact_id', '')::UUID;
  v_conversation_id := NULLIF(p_payload->>'conversation_id', '')::UUID;
  v_catalog_item_id := NULLIF(p_payload->>'catalog_item_id', '')::UUID;
  v_executive_user_id := COALESCE(
    NULLIF(p_payload->>'executive_user_id', '')::UUID,
    v_quote.executive_user_id,
    auth.uid()
  );

  IF v_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts contact
    WHERE contact.id = v_contact_id AND contact.account_id = v_quote.account_id
  ) THEN
    RAISE EXCEPTION 'quotation_contact_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations conversation
    WHERE conversation.id = v_conversation_id
      AND conversation.account_id = v_quote.account_id
      AND (v_contact_id IS NULL OR conversation.contact_id = v_contact_id)
      AND public.can_operate_ticket(conversation.id)
  ) THEN
    RAISE EXCEPTION 'quotation_conversation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_catalog_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.catalog_items item
    WHERE item.id = v_catalog_item_id AND item.account_id = v_quote.account_id
  ) THEN
    RAISE EXCEPTION 'quotation_catalog_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_executive
  FROM public.profiles profile
  WHERE profile.user_id = v_executive_user_id
    AND profile.account_id = v_quote.account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation_executive_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.quotations SET
    contact_id = v_contact_id,
    conversation_id = v_conversation_id,
    catalog_item_id = v_catalog_item_id,
    executive_user_id = v_executive_user_id,
    executive_name = COALESCE(NULLIF(trim(p_payload->>'executive_name'), ''), v_executive.full_name),
    executive_phone = COALESCE(p_payload->>'executive_phone', ''),
    executive_email = COALESCE(NULLIF(trim(p_payload->>'executive_email'), ''), v_executive.email),
    client_name = trim(p_payload->>'client_name'),
    client_rut = NULLIF(trim(p_payload->>'client_rut'), ''),
    client_phone = trim(p_payload->>'client_phone'),
    client_email = NULLIF(trim(p_payload->>'client_email'), ''),
    client_city = NULLIF(trim(p_payload->>'client_city'), ''),
    vehicle_make = trim(p_payload->>'vehicle_make'),
    vehicle_model = trim(p_payload->>'vehicle_model'),
    vehicle_version = COALESCE(p_payload->>'vehicle_version', ''),
    vehicle_year = NULLIF(p_payload->>'vehicle_year', '')::SMALLINT,
    vehicle_color = COALESCE(p_payload->>'vehicle_color', ''),
    vehicle_fuel = COALESCE(p_payload->>'vehicle_fuel', ''),
    vehicle_transmission = COALESCE(p_payload->>'vehicle_transmission', ''),
    vehicle_drivetrain = COALESCE(p_payload->>'vehicle_drivetrain', ''),
    vehicle_mileage_km = COALESCE(NULLIF(p_payload->>'vehicle_mileage_km', '')::BIGINT, 0),
    vehicle_plate = NULLIF(trim(p_payload->>'vehicle_plate'), ''),
    vehicle_image_url = NULLIF(trim(p_payload->>'vehicle_image_url'), ''),
    purchase_type = COALESCE(NULLIF(p_payload->>'purchase_type', ''), 'financed'),
    list_price = COALESCE(NULLIF(p_payload->>'list_price', '')::BIGINT, 0),
    discount_amount = COALESCE(NULLIF(p_payload->>'discount_amount', '')::BIGINT, 0),
    down_payment = COALESCE(NULLIF(p_payload->>'down_payment', '')::BIGINT, 0),
    financed_expenses = COALESCE(NULLIF(p_payload->>'financed_expenses', '')::BIGINT, 0),
    issue_date = NULLIF(p_payload->>'issue_date', '')::DATE,
    valid_until = NULLIF(p_payload->>'valid_until', '')::DATE,
    document_notes = COALESCE(p_payload->>'document_notes', ''),
    internal_notes = COALESCE(p_payload->>'internal_notes', ''),
    terms_text = COALESCE(p_payload->>'terms_text', ''),
    message_text = COALESCE(p_payload->>'message_text', ''),
    updated_by_user_id = auth.uid()
  WHERE id = v_quote.id
  RETURNING * INTO v_quote;

  DELETE FROM public.quotation_installment_options
  WHERE quotation_id = v_quote.id;

  IF v_quote.purchase_type = 'financed' THEN
    IF jsonb_typeof(p_payload->'installments') <> 'array'
       OR jsonb_array_length(p_payload->'installments') = 0 THEN
      RAISE EXCEPTION 'quotation_installment_required' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.quotation_installment_options (
      account_id, quotation_id, term_months, monthly_payment,
      observation, sort_order
    )
    SELECT
      v_quote.account_id,
      v_quote.id,
      (entry.value->>'term_months')::SMALLINT,
      (entry.value->>'monthly_payment')::BIGINT,
      COALESCE(NULLIF(trim(entry.value->>'observation'), ''), 'Referencial'),
      (entry.ordinality - 1)::SMALLINT
    FROM jsonb_array_elements(p_payload->'installments')
      WITH ORDINALITY AS entry(value, ordinality);
  END IF;

  RETURN v_quote;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_quotation_status(
  p_quotation_id UUID,
  p_status TEXT
) RETURNS public.quotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_allowed BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_quote FROM public.quotations
  WHERE id = p_quotation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_quotation(v_quote.id) THEN
    RAISE EXCEPTION 'quotation_status_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_status = v_quote.status THEN RETURN v_quote; END IF;

  v_allowed := CASE v_quote.status
    WHEN 'draft' THEN p_status IN ('generated', 'cancelled')
    WHEN 'generated' THEN p_status IN ('sent', 'negotiating', 'financing_pending', 'accepted', 'rejected', 'expired', 'cancelled')
    WHEN 'sent' THEN p_status IN ('negotiating', 'financing_pending', 'accepted', 'rejected', 'expired', 'cancelled')
    WHEN 'negotiating' THEN p_status IN ('sent', 'financing_pending', 'accepted', 'rejected', 'expired', 'cancelled')
    WHEN 'financing_pending' THEN p_status IN ('sent', 'accepted', 'rejected', 'cancelled')
    WHEN 'accepted' THEN p_status IN ('contract_completed', 'cancelled')
    WHEN 'rejected' THEN p_status IN ('generated', 'cancelled')
    WHEN 'expired' THEN p_status IN ('generated', 'cancelled')
    ELSE FALSE
  END;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'quotation_invalid_status_transition'
      USING ERRCODE = 'P0001', DETAIL = v_quote.status || ' -> ' || p_status;
  END IF;

  UPDATE public.quotations SET
    status = p_status,
    updated_by_user_id = auth.uid()
  WHERE id = v_quote.id
  RETURNING * INTO v_quote;
  RETURN v_quote;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_protected_quotation_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.deletion_hold THEN
    RAISE EXCEPTION 'quotation_deletion_hold' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'financing_pending' THEN
    RAISE EXCEPTION 'quotation_financing_pending_delete_blocked' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_protected_quotation_delete ON public.quotations;
CREATE TRIGGER prevent_protected_quotation_delete
  BEFORE DELETE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_quotation_delete();

ALTER FUNCTION public.update_vehicle_quotation(UUID, JSONB) OWNER TO postgres;
ALTER FUNCTION public.set_quotation_status(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_vehicle_quotation(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_quotation_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_vehicle_quotation(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_quotation_status(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_quotation_version(
  p_quotation_id UUID,
  p_snapshot JSONB
) RETURNS public.quotation_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_version public.quotation_versions%ROWTYPE;
  v_number INTEGER;
BEGIN
  SELECT * INTO v_quote FROM public.quotations
  WHERE id = p_quotation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quotation_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_manage_quotation(v_quote.id) THEN
    RAISE EXCEPTION 'quotation_generate_forbidden' USING ERRCODE = '42501';
  END IF;
  v_number := v_quote.current_version + 1;
  UPDATE public.quotations
  SET current_version = v_number,
      updated_by_user_id = auth.uid()
  WHERE id = v_quote.id;
  INSERT INTO public.quotation_versions (
    account_id, quotation_id, version_number, snapshot,
    generation_status, generated_by_user_id
  ) VALUES (
    v_quote.account_id, v_quote.id, v_number, p_snapshot,
    'pending', auth.uid()
  ) RETURNING * INTO v_version;
  INSERT INTO public.quotation_events (
    account_id, quotation_id, event_type, actor_user_id, metadata
  ) VALUES (
    v_quote.account_id, v_quote.id,
    CASE WHEN v_number = 1 THEN 'generated' ELSE 'versioned' END,
    auth.uid(), jsonb_build_object('version', v_number)
  );
  RETURN v_version;
END;
$$;

ALTER FUNCTION public.reserve_quotation_version(UUID, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reserve_quotation_version(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_quotation_version(UUID, JSONB) TO authenticated;

-- Audit status changes and stamp their terminal dates. Application routes
-- still validate allowed transitions; this trigger guarantees history even
-- for an approved direct database update.
CREATE OR REPLACE FUNCTION public.audit_quotation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_event TEXT := 'updated';
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := 'status_changed';
    IF NEW.status = 'generated' AND NEW.generated_at IS NULL THEN
      NEW.generated_at := NOW();
    ELSIF NEW.status = 'sent' THEN
      NEW.last_sent_at := COALESCE(NEW.last_sent_at, NOW());
    ELSIF NEW.status = 'accepted' AND NEW.accepted_at IS NULL THEN
      NEW.accepted_at := NOW();
    ELSIF NEW.status = 'rejected' AND NEW.rejected_at IS NULL THEN
      NEW.rejected_at := NOW();
    ELSIF NEW.status = 'contract_completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
  ELSIF NEW.deletion_hold IS DISTINCT FROM OLD.deletion_hold THEN
    v_event := CASE WHEN NEW.deletion_hold THEN 'hold_enabled' ELSE 'hold_disabled' END;
  END IF;

  INSERT INTO public.quotation_events (
    account_id, quotation_id, event_type, actor_user_id,
    from_status, to_status, metadata
  ) VALUES (
    NEW.account_id, NEW.id, v_event, auth.uid(), OLD.status, NEW.status,
    CASE WHEN NEW.deletion_hold IS DISTINCT FROM OLD.deletion_hold
      THEN jsonb_build_object('reason', NEW.deletion_hold_reason)
      ELSE '{}'::JSONB
    END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_quotation_change ON public.quotations;
CREATE TRIGGER audit_quotation_change
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.audit_quotation_change();

-- --------------------------------------------------------------------------
-- Row-level security.
-- --------------------------------------------------------------------------
ALTER TABLE public.quotation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_installment_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotation_settings_select ON public.quotation_settings;
CREATE POLICY quotation_settings_select ON public.quotation_settings FOR SELECT
  USING (public.is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS quotation_settings_insert ON public.quotation_settings;
CREATE POLICY quotation_settings_insert ON public.quotation_settings FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin'));
DROP POLICY IF EXISTS quotation_settings_update ON public.quotation_settings;
CREATE POLICY quotation_settings_update ON public.quotation_settings FOR UPDATE
  USING (public.is_account_member(account_id, 'admin'))
  WITH CHECK (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS quotations_select ON public.quotations;
CREATE POLICY quotations_select ON public.quotations FOR SELECT
  USING (public.can_view_quotation(id));
DROP POLICY IF EXISTS quotations_insert ON public.quotations;
CREATE POLICY quotations_insert ON public.quotations FOR INSERT
  WITH CHECK (
    public.is_account_member(account_id, 'agent')
    AND created_by_user_id = auth.uid()
    AND updated_by_user_id = auth.uid()
  );
DROP POLICY IF EXISTS quotations_update ON public.quotations;
CREATE POLICY quotations_update ON public.quotations FOR UPDATE
  USING (public.can_manage_quotation(id))
  WITH CHECK (public.can_manage_quotation(id));
DROP POLICY IF EXISTS quotations_delete ON public.quotations;
CREATE POLICY quotations_delete ON public.quotations FOR DELETE
  USING (
    public.current_account_role(account_id) IN ('owner', 'admin')
    OR (created_by_user_id = auth.uid() AND status = 'draft')
  );

DROP POLICY IF EXISTS quotation_installments_select ON public.quotation_installment_options;
CREATE POLICY quotation_installments_select ON public.quotation_installment_options FOR SELECT
  USING (public.can_view_quotation(quotation_id));
DROP POLICY IF EXISTS quotation_installments_insert ON public.quotation_installment_options;
CREATE POLICY quotation_installments_insert ON public.quotation_installment_options FOR INSERT
  WITH CHECK (public.can_manage_quotation(quotation_id));
DROP POLICY IF EXISTS quotation_installments_update ON public.quotation_installment_options;
CREATE POLICY quotation_installments_update ON public.quotation_installment_options FOR UPDATE
  USING (public.can_manage_quotation(quotation_id))
  WITH CHECK (public.can_manage_quotation(quotation_id));
DROP POLICY IF EXISTS quotation_installments_delete ON public.quotation_installment_options;
CREATE POLICY quotation_installments_delete ON public.quotation_installment_options FOR DELETE
  USING (public.can_manage_quotation(quotation_id));

DROP POLICY IF EXISTS quotation_versions_select ON public.quotation_versions;
CREATE POLICY quotation_versions_select ON public.quotation_versions FOR SELECT
  USING (public.can_view_quotation(quotation_id));
DROP POLICY IF EXISTS quotation_versions_insert ON public.quotation_versions;
CREATE POLICY quotation_versions_insert ON public.quotation_versions FOR INSERT
  WITH CHECK (public.can_manage_quotation(quotation_id));
DROP POLICY IF EXISTS quotation_versions_update ON public.quotation_versions;
CREATE POLICY quotation_versions_update ON public.quotation_versions FOR UPDATE
  USING (public.can_manage_quotation(quotation_id))
  WITH CHECK (public.can_manage_quotation(quotation_id));

DROP POLICY IF EXISTS quotation_sends_select ON public.quotation_sends;
CREATE POLICY quotation_sends_select ON public.quotation_sends FOR SELECT
  USING (public.can_view_quotation(quotation_id));
DROP POLICY IF EXISTS quotation_sends_insert ON public.quotation_sends;
CREATE POLICY quotation_sends_insert ON public.quotation_sends FOR INSERT
  WITH CHECK (public.can_manage_quotation(quotation_id));
DROP POLICY IF EXISTS quotation_sends_update ON public.quotation_sends;
CREATE POLICY quotation_sends_update ON public.quotation_sends FOR UPDATE
  USING (public.can_manage_quotation(quotation_id))
  WITH CHECK (public.can_manage_quotation(quotation_id));

DROP POLICY IF EXISTS quotation_events_select ON public.quotation_events;
CREATE POLICY quotation_events_select ON public.quotation_events FOR SELECT
  USING (public.can_view_quotation(quotation_id));
DROP POLICY IF EXISTS quotation_events_insert ON public.quotation_events;
CREATE POLICY quotation_events_insert ON public.quotation_events FOR INSERT
  WITH CHECK (public.can_manage_quotation(quotation_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_installment_options TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quotation_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quotation_sends TO authenticated;
GRANT SELECT, INSERT ON public.quotation_events TO authenticated;

-- --------------------------------------------------------------------------
-- Private quote artifacts.
-- Required path:
-- account-<account_id>/quotes/<quotation_id>/<version>/<filename>
-- --------------------------------------------------------------------------
INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) VALUES (
  'quotation-documents',
  'quotation-documents',
  FALSE,
  20971520,
  ARRAY['application/pdf', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Quotation documents authorized read" ON storage.objects;
CREATE POLICY "Quotation documents authorized read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'quotation-documents'
    AND (storage.foldername(name))[2] = 'quotes'
    AND EXISTS (
      SELECT 1 FROM public.quotations quote
      WHERE ('account-' || quote.account_id::TEXT) = (storage.foldername(name))[1]
        AND quote.id::TEXT = (storage.foldername(name))[3]
        AND public.can_view_quotation(quote.id)
    )
  );

DROP POLICY IF EXISTS "Quotation documents authorized upload" ON storage.objects;
CREATE POLICY "Quotation documents authorized upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'quotation-documents'
    AND (storage.foldername(name))[2] = 'quotes'
    AND array_length(storage.foldername(name), 1) = 4
    AND (storage.foldername(name))[4] ~ '^[1-9][0-9]*$'
    AND EXISTS (
      SELECT 1 FROM public.quotations quote
      WHERE ('account-' || quote.account_id::TEXT) = (storage.foldername(name))[1]
        AND quote.id::TEXT = (storage.foldername(name))[3]
        AND public.can_manage_quotation(quote.id)
    )
  );

DROP POLICY IF EXISTS "Quotation documents authorized update" ON storage.objects;
CREATE POLICY "Quotation documents authorized update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'quotation-documents'
    AND EXISTS (
      SELECT 1 FROM public.quotations quote
      WHERE ('account-' || quote.account_id::TEXT) = (storage.foldername(name))[1]
        AND quote.id::TEXT = (storage.foldername(name))[3]
        AND public.can_manage_quotation(quote.id)
    )
  );

DROP POLICY IF EXISTS "Quotation documents authorized delete" ON storage.objects;
CREATE POLICY "Quotation documents authorized delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'quotation-documents'
    AND EXISTS (
      SELECT 1 FROM public.quotations quote
      WHERE ('account-' || quote.account_id::TEXT) = (storage.foldername(name))[1]
        AND quote.id::TEXT = (storage.foldername(name))[3]
        AND public.can_manage_quotation(quote.id)
    )
  );

-- Realtime keeps lists and chat quote cards current.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'quotations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quotations;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'quotation_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quotation_events;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
