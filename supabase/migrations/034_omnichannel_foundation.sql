-- ============================================================
-- 034_omnichannel_foundation.sql — Channel identity + social connections
--
-- This migration does not connect Facebook or Instagram and does not
-- change WhatsApp delivery. Existing conversations are explicitly kept
-- on the WhatsApp channel through the new column's default/backfill.
-- ============================================================

CREATE TABLE IF NOT EXISTS channel_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('facebook', 'instagram')),
  external_account_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected', 'pending', 'connected', 'error')),
  scopes TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_at TIMESTAMPTZ,
  token_expires_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT channel_connections_account_channel_external_unique
    UNIQUE (account_id, channel, external_account_id),
  CONSTRAINT channel_connections_id_account_unique UNIQUE (id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_connections_account_channel
  ON channel_connections(account_id, channel, status);

DROP TRIGGER IF EXISTS set_updated_at ON channel_connections;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON channel_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_connections_select ON channel_connections;
DROP POLICY IF EXISTS channel_connections_insert ON channel_connections;
DROP POLICY IF EXISTS channel_connections_update ON channel_connections;
DROP POLICY IF EXISTS channel_connections_delete ON channel_connections;

CREATE POLICY channel_connections_select ON channel_connections FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY channel_connections_insert ON channel_connections FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY channel_connections_update ON channel_connections FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY channel_connections_delete ON channel_connections FOR DELETE
  USING (is_account_member(account_id, 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON channel_connections TO authenticated;

-- Tokens live separately so a normal authenticated SELECT can never return
-- encrypted credentials. Only server-side service-role code may access this
-- table; RLS is enabled with no authenticated policies.
CREATE TABLE IF NOT EXISTS channel_connection_secrets (
  connection_id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT channel_connection_secrets_connection_account_fkey
    FOREIGN KEY (connection_id, account_id)
    REFERENCES channel_connections(id, account_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS set_updated_at ON channel_connection_secrets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON channel_connection_secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE channel_connection_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON channel_connection_secrets FROM anon, authenticated;
GRANT ALL ON channel_connection_secrets TO service_role;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS channel_connection_id UUID,
  ADD COLUMN IF NOT EXISTS external_conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS external_participant_id TEXT;

UPDATE conversations
SET channel = 'whatsapp'
WHERE channel IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_channel_check'
      AND conrelid = 'conversations'::regclass
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_channel_check
      CHECK (channel IN ('whatsapp', 'facebook', 'instagram'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_channel_connection_account_fkey'
      AND conrelid = 'conversations'::regclass
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_channel_connection_account_fkey
      FOREIGN KEY (channel_connection_id, account_id)
      REFERENCES channel_connections(id, account_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_channel_pairing_check'
      AND conrelid = 'conversations'::regclass
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_channel_pairing_check
      CHECK (
        (channel = 'whatsapp' AND channel_connection_id IS NULL)
        OR
        (channel IN ('facebook', 'instagram') AND whatsapp_config_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_account_channel_activity
  ON conversations(account_id, channel, status, last_message_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_social_participant_unique
  ON conversations(account_id, channel, channel_connection_id, external_participant_id)
  WHERE channel IN ('facebook', 'instagram')
    AND channel_connection_id IS NOT NULL
    AND external_participant_id IS NOT NULL;

