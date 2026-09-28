-- Soft-delete WhatsApp QR connections without breaking historical
-- conversations that still reference whatsapp_config.

BEGIN;

SET search_path = public, pg_catalog;

ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_active_account
  ON public.whatsapp_config(account_id, provider, created_at)
  WHERE removed_at IS NULL;

DROP INDEX IF EXISTS public.idx_whatsapp_config_default_per_account;
CREATE UNIQUE INDEX idx_whatsapp_config_default_per_account
  ON public.whatsapp_config(account_id)
  WHERE is_default AND removed_at IS NULL;

DROP INDEX IF EXISTS public.idx_whatsapp_qr_phone_unique;
CREATE UNIQUE INDEX idx_whatsapp_qr_phone_unique
  ON public.whatsapp_config(display_phone)
  WHERE provider = 'whatsapp_web'
    AND display_phone IS NOT NULL
    AND removed_at IS NULL;

CREATE OR REPLACE FUNCTION public.channel_active_usage(
  target_account_id UUID
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT (
    SELECT COUNT(*)::INTEGER
    FROM public.whatsapp_config config
    WHERE config.account_id = target_account_id
      AND config.removed_at IS NULL
  ) + (
    SELECT COUNT(*)::INTEGER
    FROM public.channel_connections connection
    WHERE connection.account_id = target_account_id
      AND connection.status <> 'disconnected'
  );
$$;

CREATE OR REPLACE FUNCTION public.platform_account_overview()
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  owner_name TEXT,
  owner_email TEXT,
  plan_code TEXT,
  plan_name TEXT,
  subscription_status account_subscription_status_enum,
  trial_ends_at TIMESTAMPTZ,
  grace_ends_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  suspension_reason TEXT,
  account_created_at TIMESTAMPTZ,
  users_count BIGINT,
  contacts_count BIGINT,
  conversations_count BIGINT,
  whatsapp_status TEXT,
  whatsapp_provider TEXT,
  social_channels_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.name,
    owner_profile.full_name,
    owner_profile.email,
    a.plan_code,
    COALESCE(sp.name, a.plan_code),
    a.subscription_status,
    a.trial_ends_at,
    a.grace_ends_at,
    a.current_period_ends_at,
    a.suspended_at,
    a.suspension_reason,
    a.created_at,
    COALESCE(member_totals.total, 0),
    COALESCE(contact_totals.total, 0),
    COALESCE(conversation_totals.total, 0),
    wc.status,
    wc.provider,
    COALESCE(social_totals.total, 0)
  FROM accounts a
  LEFT JOIN saas_plans sp ON sp.code = a.plan_code
  LEFT JOIN LATERAL (
    SELECT p.full_name, p.email
    FROM profiles p
    WHERE p.user_id = a.owner_user_id
    LIMIT 1
  ) owner_profile ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS total FROM profiles p WHERE p.account_id = a.id
  ) member_totals ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS total FROM contacts c WHERE c.account_id = a.id
  ) contact_totals ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS total
    FROM conversations c
    WHERE c.account_id = a.id
  ) conversation_totals ON TRUE
  LEFT JOIN LATERAL (
    SELECT config.status, config.provider
    FROM whatsapp_config config
    WHERE config.account_id = a.id
      AND config.removed_at IS NULL
    ORDER BY
      (config.status = 'connected') DESC,
      config.is_default DESC,
      config.created_at ASC
    LIMIT 1
  ) wc ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS total
    FROM channel_connections cc
    WHERE cc.account_id = a.id AND cc.status = 'connected'
  ) social_totals ON TRUE
  ORDER BY a.created_at DESC;
$$;

ALTER FUNCTION public.channel_active_usage(UUID) OWNER TO postgres;
ALTER FUNCTION public.platform_account_overview() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.channel_active_usage(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_account_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_account_overview() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
