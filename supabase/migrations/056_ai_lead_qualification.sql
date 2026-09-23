-- ============================================================================
-- 056_ai_lead_qualification.sql
-- Account- and conversation-scoped lead prequalification captured by Nexora AI.
-- Sensitive financing details remain behind ticket visibility RLS.
-- ============================================================================

SET search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS public.conversation_lead_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  full_name TEXT,
  rut TEXT,
  phone TEXT,
  city TEXT,
  vehicle_interest TEXT,
  down_payment TEXT,
  income_proof BOOLEAN,
  employment_type TEXT,
  employment_tenure TEXT,
  has_dicom BOOLEAN,
  trade_in BOOLEAN,
  trade_in_vehicle TEXT,
  purchase_timeline TEXT,
  financing_requested BOOLEAN,
  captured_by_ai BOOLEAN NOT NULL DEFAULT TRUE,
  last_source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversation_lead_profiles_conversation_unique
    UNIQUE (conversation_id),
  CONSTRAINT conversation_lead_profiles_text_lengths CHECK (
    length(COALESCE(full_name, '')) <= 160
    AND length(COALESCE(rut, '')) <= 20
    AND length(COALESCE(phone, '')) <= 40
    AND length(COALESCE(city, '')) <= 160
    AND length(COALESCE(vehicle_interest, '')) <= 300
    AND length(COALESCE(down_payment, '')) <= 120
    AND length(COALESCE(employment_type, '')) <= 160
    AND length(COALESCE(employment_tenure, '')) <= 160
    AND length(COALESCE(trade_in_vehicle, '')) <= 300
    AND length(COALESCE(purchase_timeline, '')) <= 160
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_lead_profiles_account_conversation
  ON public.conversation_lead_profiles(account_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_lead_profiles_account_contact
  ON public.conversation_lead_profiles(account_id, contact_id, updated_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.conversation_lead_profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.conversation_lead_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.conversation_lead_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_lead_profiles_select
  ON public.conversation_lead_profiles;
DROP POLICY IF EXISTS conversation_lead_profiles_insert
  ON public.conversation_lead_profiles;
DROP POLICY IF EXISTS conversation_lead_profiles_update
  ON public.conversation_lead_profiles;
DROP POLICY IF EXISTS conversation_lead_profiles_delete
  ON public.conversation_lead_profiles;

CREATE POLICY conversation_lead_profiles_select
  ON public.conversation_lead_profiles FOR SELECT
  USING (
    is_account_member(account_id)
    AND can_view_ticket(conversation_id)
  );

CREATE POLICY conversation_lead_profiles_insert
  ON public.conversation_lead_profiles FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND can_operate_ticket(conversation_id)
  );

CREATE POLICY conversation_lead_profiles_update
  ON public.conversation_lead_profiles FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    AND can_operate_ticket(conversation_id)
  )
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND can_operate_ticket(conversation_id)
  );

CREATE POLICY conversation_lead_profiles_delete
  ON public.conversation_lead_profiles FOR DELETE
  USING (is_account_member(account_id, 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.conversation_lead_profiles TO authenticated;

COMMENT ON TABLE public.conversation_lead_profiles IS
  'Structured lead information confirmed during one conversation. Financing fields are protected by ticket visibility RLS.';
COMMENT ON COLUMN public.conversation_lead_profiles.has_dicom IS
  'Customer-declared financing prequalification datum; never an external credit check.';

-- Existing active automatic agents gain the requested qualification workflow.
-- A larger turn allowance lets the agent ask progressively instead of sending a
-- questionnaire. Company administrators can still lower it from Agentes IA.
UPDATE public.ai_configs
SET permissions = permissions || '{"classify_leads": true}'::JSONB,
    lead_fields = ARRAY[
      'nombre completo',
      'RUT para financiamiento',
      'teléfono',
      'ciudad o comuna',
      'vehículo que busca',
      'pie disponible',
      'acredita ingresos',
      'tipo de contrato',
      'antigüedad laboral',
      'presenta DICOM',
      'vehículo en parte de pago',
      'momento estimado de compra'
    ]::TEXT[],
    auto_reply_max_per_conversation = GREATEST(
      auto_reply_max_per_conversation,
      12
    )
WHERE is_active = TRUE
  AND auto_reply_enabled = TRUE
  AND operating_mode = 'automatic';

NOTIFY pgrst, 'reload schema';
