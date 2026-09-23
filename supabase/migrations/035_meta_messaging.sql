-- ============================================================
-- 035_meta_messaging.sql — Social participant identities + idempotency
--
-- Completes the data layer required by Facebook Messenger and Instagram
-- Messaging. OAuth tokens remain in channel_connection_secrets (034),
-- while this table maps a channel-scoped participant id to one CRM contact.
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_channel_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('facebook', 'instagram')),
  channel_connection_id UUID NOT NULL,
  external_participant_id TEXT NOT NULL,
  display_name TEXT,
  username TEXT,
  avatar_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contact_channel_identities_connection_account_fkey
    FOREIGN KEY (channel_connection_id, account_id)
    REFERENCES channel_connections(id, account_id) ON DELETE CASCADE,
  CONSTRAINT contact_channel_identities_connection_participant_unique
    UNIQUE (account_id, channel, channel_connection_id, external_participant_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_channel_identities_contact
  ON contact_channel_identities(account_id, contact_id);

DROP TRIGGER IF EXISTS set_updated_at ON contact_channel_identities;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON contact_channel_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE contact_channel_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_channel_identities_select
  ON contact_channel_identities;
CREATE POLICY contact_channel_identities_select
  ON contact_channel_identities FOR SELECT
  USING (is_account_member(account_id));

-- Identity writes only happen in the signed Meta webhook using service_role.
-- Dashboard users can read them through RLS but cannot forge external ids.
REVOKE INSERT, UPDATE, DELETE ON contact_channel_identities FROM authenticated;
GRANT SELECT ON contact_channel_identities TO authenticated;
GRANT ALL ON contact_channel_identities TO service_role;

-- Meta retries webhook deliveries. This makes message persistence
-- idempotent per conversation without assuming ids are globally unique
-- across WhatsApp, Facebook and Instagram.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_external_unique
  ON messages(conversation_id, message_id)
  WHERE message_id IS NOT NULL;
