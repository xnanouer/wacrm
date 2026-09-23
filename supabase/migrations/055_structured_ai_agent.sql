-- ============================================================================
-- 055_structured_ai_agent.sql
-- Structured, account-scoped configuration for the single Nexora AI agent.
--
-- This migration is additive:
--   * ai_configs remains the single source of truth (UNIQUE account_id).
--   * existing prompts and legacy automatic-reply settings are preserved.
--   * knowledge documents are extended to also represent FAQs.
--   * schedules and enabled connections are account-scoped relations.
--   * no calendar, audio provider, payment or automatic catalog send is added.
-- ============================================================================

SET search_path = public, pg_catalog;

ALTER TABLE public.ai_configs
  ADD COLUMN IF NOT EXISTS agent_name TEXT NOT NULL DEFAULT 'Asistente Nexora',
  ADD COLUMN IF NOT EXISTS agent_title TEXT NOT NULL DEFAULT 'Asistente virtual',
  ADD COLUMN IF NOT EXISTS agent_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'es-CL',
  ADD COLUMN IF NOT EXISTS introduction_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS introduction_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS welcome_message TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS out_of_hours_message TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tone TEXT NOT NULL DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS custom_tone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS primary_objective TEXT NOT NULL DEFAULT 'answer_faqs',
  ADD COLUMN IF NOT EXISTS custom_objective TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS additional_instructions TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS operating_mode TEXT NOT NULL DEFAULT 'suggestion',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  ADD COLUMN IF NOT EXISTS after_hours_behavior TEXT NOT NULL DEFAULT 'suggestions_only',
  ADD COLUMN IF NOT EXISTS business_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_industry TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_addresses TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS business_phones TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS business_emails TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS business_service_areas TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS business_channels TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS general_policies TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS general_requirements TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS authorized_commercial_info TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{
    "generate_suggestions": true,
    "summarize_conversations": false,
    "classify_leads": false,
    "read_contact": false,
    "read_opportunities": false,
    "query_catalog": false,
    "suggest_catalog_items": false,
    "create_followups": false,
    "recommend_handoff": true,
    "understand_audio": false,
    "generate_audio": false,
    "query_future_availability": false,
    "request_future_appointment": false
  }'::JSONB,
  ADD COLUMN IF NOT EXISTS lead_fields TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS escalation_rules TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Preserve legacy automatic-reply accounts while every new configuration
-- continues to default to the safe suggestion-only mode.
UPDATE public.ai_configs
SET operating_mode = 'automatic'
WHERE auto_reply_enabled = TRUE
  AND operating_mode = 'suggestion';

ALTER TABLE public.ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_agent_name_check,
  DROP CONSTRAINT IF EXISTS ai_configs_agent_title_check,
  DROP CONSTRAINT IF EXISTS ai_configs_agent_avatar_url_check,
  DROP CONSTRAINT IF EXISTS ai_configs_language_check,
  DROP CONSTRAINT IF EXISTS ai_configs_identity_messages_check,
  DROP CONSTRAINT IF EXISTS ai_configs_tone_check,
  DROP CONSTRAINT IF EXISTS ai_configs_primary_objective_check,
  DROP CONSTRAINT IF EXISTS ai_configs_operating_mode_check,
  DROP CONSTRAINT IF EXISTS ai_configs_timezone_check,
  DROP CONSTRAINT IF EXISTS ai_configs_after_hours_behavior_check,
  DROP CONSTRAINT IF EXISTS ai_configs_business_text_check,
  DROP CONSTRAINT IF EXISTS ai_configs_business_arrays_check,
  DROP CONSTRAINT IF EXISTS ai_configs_permissions_check,
  DROP CONSTRAINT IF EXISTS ai_configs_lead_fields_check,
  DROP CONSTRAINT IF EXISTS ai_configs_escalation_rules_check;

ALTER TABLE public.ai_configs
  ADD CONSTRAINT ai_configs_agent_name_check
    CHECK (length(trim(agent_name)) BETWEEN 1 AND 80),
  ADD CONSTRAINT ai_configs_agent_title_check
    CHECK (length(agent_title) <= 120),
  ADD CONSTRAINT ai_configs_agent_avatar_url_check
    CHECK (agent_avatar_url IS NULL OR length(agent_avatar_url) <= 1000),
  ADD CONSTRAINT ai_configs_language_check
    CHECK (language IN ('es-CL', 'es', 'en', 'pt-BR')),
  ADD CONSTRAINT ai_configs_identity_messages_check CHECK (
    length(introduction_text) <= 1000
    AND length(welcome_message) <= 1000
    AND length(out_of_hours_message) <= 1000
  ),
  ADD CONSTRAINT ai_configs_tone_check
    CHECK (tone IN (
      'professional', 'friendly', 'direct', 'formal',
      'commercial', 'technical', 'custom'
    )),
  ADD CONSTRAINT ai_configs_primary_objective_check
    CHECK (primary_objective IN (
      'answer_faqs', 'capture_customer_data', 'qualify_leads',
      'create_opportunities', 'get_visit', 'handoff',
      'catalog_support', 'follow_up', 'custom'
    )),
  ADD CONSTRAINT ai_configs_operating_mode_check
    CHECK (operating_mode IN ('suggestion', 'semi_automatic', 'automatic')),
  ADD CONSTRAINT ai_configs_timezone_check
    CHECK (length(trim(timezone)) BETWEEN 1 AND 80),
  ADD CONSTRAINT ai_configs_after_hours_behavior_check
    CHECK (after_hours_behavior IN (
      'suggestions_only', 'log_only', 'handoff',
      'send_out_of_hours_message', 'disabled'
    )),
  ADD CONSTRAINT ai_configs_business_text_check CHECK (
    length(business_description) <= 5000
    AND length(business_industry) <= 160
    AND length(general_policies) <= 10000
    AND length(general_requirements) <= 5000
    AND length(authorized_commercial_info) <= 10000
    AND length(custom_tone) <= 2000
    AND length(custom_objective) <= 3000
    AND length(additional_instructions) <= 20000
  ),
  ADD CONSTRAINT ai_configs_business_arrays_check CHECK (
    cardinality(business_addresses) <= 20
    AND cardinality(business_phones) <= 20
    AND cardinality(business_emails) <= 20
    AND cardinality(business_service_areas) <= 50
    AND cardinality(business_channels) <= 20
  ),
  ADD CONSTRAINT ai_configs_permissions_check
    CHECK (jsonb_typeof(permissions) = 'object'),
  ADD CONSTRAINT ai_configs_lead_fields_check
    CHECK (cardinality(lead_fields) <= 30),
  ADD CONSTRAINT ai_configs_escalation_rules_check
    CHECK (cardinality(escalation_rules) <= 30);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_configs_id_account_unique
  ON public.ai_configs(id, account_id);

COMMENT ON COLUMN public.ai_configs.permissions IS
  'Backend-enforced capability switches. Future capabilities remain false until their server implementation exists.';
COMMENT ON COLUMN public.ai_configs.operating_mode IS
  'Suggestion is the safe supported mode. Legacy automatic accounts are preserved for rollback and controlled compatibility.';
COMMENT ON COLUMN public.ai_configs.updated_by_user_id IS
  'Last company administrator that saved the structured agent configuration.';

-- Daily business hours for the one account agent.
CREATE TABLE IF NOT EXISTS public.ai_agent_business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  ai_config_id UUID NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIME NOT NULL DEFAULT '09:00',
  ends_at TIME NOT NULL DEFAULT '18:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_agent_business_hours_config_account_fkey
    FOREIGN KEY (ai_config_id, account_id)
    REFERENCES public.ai_configs(id, account_id) ON DELETE CASCADE,
  CONSTRAINT ai_agent_business_hours_config_day_unique
    UNIQUE (ai_config_id, day_of_week),
  CONSTRAINT ai_agent_business_hours_range_check
    CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_business_hours_account
  ON public.ai_agent_business_hours(account_id, day_of_week);

DROP TRIGGER IF EXISTS set_updated_at ON public.ai_agent_business_hours;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.ai_agent_business_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_agent_business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agent_business_hours_select
  ON public.ai_agent_business_hours;
DROP POLICY IF EXISTS ai_agent_business_hours_insert
  ON public.ai_agent_business_hours;
DROP POLICY IF EXISTS ai_agent_business_hours_update
  ON public.ai_agent_business_hours;
DROP POLICY IF EXISTS ai_agent_business_hours_delete
  ON public.ai_agent_business_hours;
CREATE POLICY ai_agent_business_hours_select
  ON public.ai_agent_business_hours FOR SELECT
  USING (public.is_account_member(account_id));
CREATE POLICY ai_agent_business_hours_insert
  ON public.ai_agent_business_hours FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY ai_agent_business_hours_update
  ON public.ai_agent_business_hours FOR UPDATE
  USING (public.is_account_member(account_id, 'admin'))
  WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY ai_agent_business_hours_delete
  ON public.ai_agent_business_hours FOR DELETE
  USING (public.is_account_member(account_id, 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.ai_agent_business_hours TO authenticated;

-- Which real company connections the single agent may use.
CREATE TABLE IF NOT EXISTS public.ai_agent_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  ai_config_id UUID NOT NULL,
  whatsapp_config_id UUID,
  channel_connection_id UUID,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_agent_connections_config_account_fkey
    FOREIGN KEY (ai_config_id, account_id)
    REFERENCES public.ai_configs(id, account_id) ON DELETE CASCADE,
  CONSTRAINT ai_agent_connections_whatsapp_account_fkey
    FOREIGN KEY (whatsapp_config_id, account_id)
    REFERENCES public.whatsapp_config(id, account_id) ON DELETE CASCADE,
  CONSTRAINT ai_agent_connections_social_account_fkey
    FOREIGN KEY (channel_connection_id, account_id)
    REFERENCES public.channel_connections(id, account_id) ON DELETE CASCADE,
  CONSTRAINT ai_agent_connections_one_target_check CHECK (
    (whatsapp_config_id IS NOT NULL AND channel_connection_id IS NULL)
    OR
    (whatsapp_config_id IS NULL AND channel_connection_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_connections_whatsapp_unique
  ON public.ai_agent_connections(ai_config_id, whatsapp_config_id)
  WHERE whatsapp_config_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_connections_social_unique
  ON public.ai_agent_connections(ai_config_id, channel_connection_id)
  WHERE channel_connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_agent_connections_account
  ON public.ai_agent_connections(account_id, is_enabled);

DROP TRIGGER IF EXISTS set_updated_at ON public.ai_agent_connections;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.ai_agent_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_agent_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agent_connections_select
  ON public.ai_agent_connections;
DROP POLICY IF EXISTS ai_agent_connections_insert
  ON public.ai_agent_connections;
DROP POLICY IF EXISTS ai_agent_connections_update
  ON public.ai_agent_connections;
DROP POLICY IF EXISTS ai_agent_connections_delete
  ON public.ai_agent_connections;
CREATE POLICY ai_agent_connections_select
  ON public.ai_agent_connections FOR SELECT
  USING (public.is_account_member(account_id));
CREATE POLICY ai_agent_connections_insert
  ON public.ai_agent_connections FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY ai_agent_connections_update
  ON public.ai_agent_connections FOR UPDATE
  USING (public.is_account_member(account_id, 'admin'))
  WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY ai_agent_connections_delete
  ON public.ai_agent_connections FOR DELETE
  USING (public.is_account_member(account_id, 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.ai_agent_connections TO authenticated;

-- Reuse the existing knowledge base for documents and FAQs.
ALTER TABLE public.ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'document',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ai_knowledge_documents
  DROP CONSTRAINT IF EXISTS ai_knowledge_documents_type_check,
  DROP CONSTRAINT IF EXISTS ai_knowledge_documents_tags_check;
ALTER TABLE public.ai_knowledge_documents
  ADD CONSTRAINT ai_knowledge_documents_type_check
    CHECK (document_type IN ('document', 'faq')),
  ADD CONSTRAINT ai_knowledge_documents_tags_check
    CHECK (cardinality(tags) <= 20);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_documents_account_type_active
  ON public.ai_knowledge_documents(account_id, document_type, is_active);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_documents_tags
  ON public.ai_knowledge_documents USING GIN(tags);

-- Inactive FAQs/documents must not be retrieved even when old chunks remain.
CREATE OR REPLACE FUNCTION public.match_ai_knowledge_fts(
  p_account_id UUID,
  p_query TEXT,
  p_match_count INTEGER
)
RETURNS TABLE (id UUID, content TEXT, rank REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    c.id,
    c.content,
    ts_rank(c.fts, plainto_tsquery('simple', p_query)) AS rank
  FROM public.ai_knowledge_chunks c
  JOIN public.ai_knowledge_documents d
    ON d.id = c.document_id
   AND d.account_id = c.account_id
  WHERE c.account_id = p_account_id
    AND d.is_active = TRUE
    AND (
      auth.role() = 'service_role'
      OR public.is_account_member(p_account_id)
    )
    AND c.fts @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(COALESCE(p_match_count, 0), 0), 20);
$$;

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_semantic(
  p_account_id UUID,
  p_query_embedding TEXT,
  p_match_count INTEGER
)
RETURNS TABLE (id UUID, content TEXT, distance REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    c.id,
    c.content,
    (c.embedding <=> p_query_embedding::vector(1536)) AS distance
  FROM public.ai_knowledge_chunks c
  JOIN public.ai_knowledge_documents d
    ON d.id = c.document_id
   AND d.account_id = c.account_id
  WHERE c.account_id = p_account_id
    AND d.is_active = TRUE
    AND (
      auth.role() = 'service_role'
      OR public.is_account_member(p_account_id)
    )
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding::vector(1536)
  LIMIT LEAST(GREATEST(COALESCE(p_match_count, 0), 0), 20);
$$;

REVOKE ALL ON FUNCTION public.match_ai_knowledge_fts(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_fts(UUID, TEXT, INTEGER)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.match_ai_knowledge_semantic(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_semantic(UUID, TEXT, INTEGER)
  TO authenticated, service_role;

-- Desired future audio rates. Audio remains disabled until a real server-side
-- provider integration is implemented and enabled by the platform owner.
UPDATE public.ai_point_action_costs
SET points_per_unit = CASE action_key
  WHEN 'audio_transcription' THEN 2
  WHEN 'audio_generation' THEN 5
  ELSE points_per_unit
END
WHERE action_key IN ('audio_transcription', 'audio_generation');

COMMENT ON COLUMN public.ai_configs.catalog_ai_auto_send IS
  'Legacy rollback field. The structured agent runtime never sends catalog items automatically.';

NOTIFY pgrst, 'reload schema';
