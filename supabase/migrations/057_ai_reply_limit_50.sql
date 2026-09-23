-- Allow longer AI-assisted sales conversations while preserving a hard cap.

SET search_path = public, pg_catalog;

ALTER TABLE public.ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_auto_reply_max_per_conversation_check;

ALTER TABLE public.ai_configs
  ADD CONSTRAINT ai_configs_auto_reply_max_per_conversation_check
  CHECK (auto_reply_max_per_conversation BETWEEN 1 AND 50);

COMMENT ON COLUMN public.ai_configs.auto_reply_max_per_conversation IS
  'Maximum automatic AI replies in one conversation. Hard-capped at 50; assignment or handoff still stops the agent immediately.';

NOTIFY pgrst, 'reload schema';
