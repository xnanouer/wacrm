-- Global automatic-response schedule for the account AI agent.
-- Existing agents remain 24/7 unless an administrator explicitly selects
-- weekend-only operation.

SET search_path = public, pg_catalog;

ALTER TABLE public.ai_configs
  ADD COLUMN IF NOT EXISTS active_schedule TEXT NOT NULL DEFAULT 'always';

ALTER TABLE public.ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_active_schedule_check;

ALTER TABLE public.ai_configs
  ADD CONSTRAINT ai_configs_active_schedule_check
  CHECK (active_schedule IN ('always', 'weekends'));

COMMENT ON COLUMN public.ai_configs.active_schedule IS
  'Controls automatic replies: always, or Saturday and Sunday in the configured timezone.';

NOTIFY pgrst, 'reload schema';
