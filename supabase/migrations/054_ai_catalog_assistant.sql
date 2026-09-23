-- ============================================================================
-- Nexora AI catalog assistant
-- Per-account controls for grounding AI replies in the company's own catalog.
-- Safe defaults keep the feature disabled until an administrator enables it.
-- ============================================================================

ALTER TABLE public.ai_configs
  ADD COLUMN IF NOT EXISTS catalog_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS catalog_ai_auto_send BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS catalog_ai_max_items SMALLINT NOT NULL DEFAULT 3;

ALTER TABLE public.ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_catalog_ai_max_items_check;
ALTER TABLE public.ai_configs
  ADD CONSTRAINT ai_configs_catalog_ai_max_items_check
  CHECK (catalog_ai_max_items BETWEEN 1 AND 5);

ALTER TABLE public.ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_catalog_ai_auto_send_check;
ALTER TABLE public.ai_configs
  ADD CONSTRAINT ai_configs_catalog_ai_auto_send_check
  CHECK (NOT catalog_ai_auto_send OR catalog_ai_enabled);

COMMENT ON COLUMN public.ai_configs.catalog_ai_enabled IS
  'Allows the AI assistant to retrieve approved, available and shareable catalog items for this account.';
COMMENT ON COLUMN public.ai_configs.catalog_ai_auto_send IS
  'Allows automatic WhatsApp replies to append real catalog cards after the generated introduction.';
COMMENT ON COLUMN public.ai_configs.catalog_ai_max_items IS
  'Maximum catalog items attached to one AI response. Hard capped at five.';

NOTIFY pgrst, 'reload schema';
