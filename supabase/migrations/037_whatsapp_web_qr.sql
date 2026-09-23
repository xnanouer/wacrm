-- ============================================================
-- 037_whatsapp_web_qr.sql — optional WhatsApp Web (QR) transport
--
-- Existing rows remain on the official Meta Cloud API. QR accounts reuse
-- the same whatsapp_config row so conversations keep their stable FK when
-- an account changes transport.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'cloud_api';

ALTER TABLE whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_provider_check;

ALTER TABLE whatsapp_config
  ADD CONSTRAINT whatsapp_config_provider_check
  CHECK (provider IN ('cloud_api', 'whatsapp_web'));

-- Meta credentials do not exist for a QR-linked session. They remain
-- required by the Meta API route whenever provider='cloud_api'.
ALTER TABLE whatsapp_config
  ALTER COLUMN phone_number_id DROP NOT NULL,
  ALTER COLUMN access_token DROP NOT NULL;

COMMENT ON COLUMN whatsapp_config.provider IS
  'cloud_api = official Meta API; whatsapp_web = linked-device QR session';
