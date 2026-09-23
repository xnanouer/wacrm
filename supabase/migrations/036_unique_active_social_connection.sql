-- ============================================================
-- 036_unique_active_social_connection.sql
--
-- A Meta webhook identifies only the Facebook Page or Instagram account.
-- It does not include the WACRM tenant. Keep one active owner for that
-- external account so routing can never cross company boundaries.
-- Disconnected history is excluded, allowing the channel to be moved to
-- another company after its encrypted token has been removed.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_active_external_unique
  ON channel_connections(channel, external_account_id)
  WHERE status <> 'disconnected';
