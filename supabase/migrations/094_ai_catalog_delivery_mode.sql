ALTER TABLE public.ai_configs
  ADD COLUMN IF NOT EXISTS catalog_delivery_mode TEXT NOT NULL DEFAULT 'summary_first';

ALTER TABLE public.ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_catalog_delivery_mode_check;

ALTER TABLE public.ai_configs
  ADD CONSTRAINT ai_configs_catalog_delivery_mode_check
  CHECK (catalog_delivery_mode IN ('summary_first', 'photos_immediately'));

COMMENT ON COLUMN public.ai_configs.catalog_delivery_mode IS
  'Controls whether the automatic AI sends a numbered catalog summary first or immediately attaches matching vehicle photos.';
