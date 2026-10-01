-- ============================================================================
-- 090_ai_contact_contract_prefill.sql
-- Reuse customer data confirmed in AI conversations when preparing contracts.
-- Canonical contact values are only filled when empty; contract generation
-- continues to require an explicit human action and stores immutable snapshots.
-- ============================================================================

SET search_path = public, pg_catalog;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS commune TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS monthly_income NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS employment_type TEXT,
  ADD COLUMN IF NOT EXISTS employment_tenure TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_plate TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_price NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS financing_requested BOOLEAN,
  ADD COLUMN IF NOT EXISTS profile_sources JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS last_profile_conversation_id UUID,
  ADD COLUMN IF NOT EXISTS last_profile_source_message_id UUID;

ALTER TABLE public.conversation_lead_profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS commune TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS monthly_income TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_plate TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_price TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contacts_last_profile_conversation_account_fkey'
      AND conrelid = 'public.contacts'::regclass
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_last_profile_conversation_account_fkey
      FOREIGN KEY (last_profile_conversation_id, account_id)
      REFERENCES public.conversations(id, account_id)
      ON DELETE SET NULL (last_profile_conversation_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversation_lead_profiles_contact_account_fkey'
      AND conrelid = 'public.conversation_lead_profiles'::regclass
  ) THEN
    ALTER TABLE public.conversation_lead_profiles
      ADD CONSTRAINT conversation_lead_profiles_contact_account_fkey
      FOREIGN KEY (contact_id, account_id)
      REFERENCES public.contacts(id, account_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversation_lead_profiles_conversation_account_fkey'
      AND conrelid = 'public.conversation_lead_profiles'::regclass
  ) THEN
    ALTER TABLE public.conversation_lead_profiles
      ADD CONSTRAINT conversation_lead_profiles_conversation_account_fkey
      FOREIGN KEY (conversation_id, account_id)
      REFERENCES public.conversations(id, account_id) ON DELETE CASCADE;
  END IF;
END;
$$;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_profile_sources_object_check;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_profile_sources_object_check
  CHECK (jsonb_typeof(profile_sources) = 'object');

ALTER TABLE public.conversation_lead_profiles
  DROP CONSTRAINT IF EXISTS conversation_lead_profiles_contract_text_lengths;
ALTER TABLE public.conversation_lead_profiles
  ADD CONSTRAINT conversation_lead_profiles_contract_text_lengths CHECK (
    length(COALESCE(email, '')) <= 254
    AND length(COALESCE(address, '')) <= 300
    AND length(COALESCE(commune, '')) <= 160
    AND length(COALESCE(region, '')) <= 160
    AND length(COALESCE(occupation, '')) <= 160
    AND length(COALESCE(company, '')) <= 200
    AND length(COALESCE(monthly_income, '')) <= 120
    AND length(COALESCE(vehicle_plate, '')) <= 20
    AND length(COALESCE(vehicle_price, '')) <= 120
    AND length(COALESCE(payment_method, '')) <= 160
  );

CREATE INDEX IF NOT EXISTS idx_contacts_account_contract_search
  ON public.contacts(account_id, name, rut_normalized, phone_normalized);

COMMENT ON COLUMN public.contacts.profile_sources IS
  'Per-field provenance for values copied from a conversation or confirmed by a human.';
COMMENT ON COLUMN public.contacts.last_profile_conversation_id IS
  'Conversation whose confirmed values most recently completed empty contact fields.';

NOTIFY pgrst, 'reload schema';
