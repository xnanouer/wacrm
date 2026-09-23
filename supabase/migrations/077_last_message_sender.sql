-- Persist who sent the latest message so response waiting times remain
-- accurate even after an executive opens and reads the conversation.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_sender_type TEXT
  CHECK (last_message_sender_type IN ('customer', 'agent', 'bot'));

WITH latest_message AS (
  SELECT DISTINCT ON (message.conversation_id)
    message.conversation_id,
    message.sender_type
  FROM public.messages message
  ORDER BY message.conversation_id, message.created_at DESC, message.id DESC
)
UPDATE public.conversations conversation
SET last_message_sender_type = latest_message.sender_type
FROM latest_message
WHERE latest_message.conversation_id = conversation.id
  AND conversation.last_message_sender_type IS NULL;

CREATE OR REPLACE FUNCTION public.sync_conversation_last_message_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_sender_type = NEW.sender_type
  WHERE id = NEW.conversation_id
    AND (last_message_at IS NULL OR NEW.created_at >= last_message_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_conversation_last_message_sender
  ON public.messages;
CREATE TRIGGER sync_conversation_last_message_sender
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.sync_conversation_last_message_sender();

CREATE INDEX IF NOT EXISTS idx_conversations_response_waiting
  ON public.conversations(account_id, last_message_at)
  WHERE last_message_sender_type = 'customer' AND status <> 'closed';
