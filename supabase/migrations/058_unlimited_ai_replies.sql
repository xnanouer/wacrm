-- Optional unlimited automatic replies. Operational stop conditions still win:
-- human assignment, handoff, disabled agent/account, provider failure or points.

SET search_path = public, pg_catalog;

ALTER TABLE public.ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_auto_reply_max_per_conversation_check;

ALTER TABLE public.ai_configs
  ALTER COLUMN auto_reply_max_per_conversation DROP NOT NULL;

ALTER TABLE public.ai_configs
  ADD CONSTRAINT ai_configs_auto_reply_max_per_conversation_check
  CHECK (
    auto_reply_max_per_conversation IS NULL
    OR auto_reply_max_per_conversation BETWEEN 1 AND 50
  );

CREATE OR REPLACE FUNCTION public.claim_ai_reply_slot(
  conversation_id UUID,
  max_replies INTEGER
)
RETURNS BOOLEAN AS $$
  WITH claimed AS (
    UPDATE public.conversations
    SET ai_reply_count = ai_reply_count + 1
    WHERE id = conversation_id
      AND (max_replies IS NULL OR ai_reply_count < max_replies)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

COMMENT ON COLUMN public.ai_configs.auto_reply_max_per_conversation IS
  'Maximum automatic replies per conversation; NULL means unlimited. Human assignment and handoff remain immediate stop conditions.';

NOTIFY pgrst, 'reload schema';
