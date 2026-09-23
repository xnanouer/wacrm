-- Multiple WhatsApp connections per company.
--
-- Existing accounts keep their current whatsapp_config row. It becomes the
-- default connection and receives a friendly label. Conversations already
-- reference whatsapp_config_id, so their origin and outbound route remain
-- stable without rewriting message history.

ALTER TABLE public.whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_account_id_key;

ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS connection_name TEXT,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.whatsapp_config
SET connection_name = COALESCE(
  NULLIF(TRIM(connection_name), ''),
  NULLIF(TRIM(display_name), ''),
  'WhatsApp principal'
);

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY account_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS position
  FROM public.whatsapp_config
)
UPDATE public.whatsapp_config config
SET is_default = ranked.position = 1
FROM ranked
WHERE ranked.id = config.id;

ALTER TABLE public.whatsapp_config
  ALTER COLUMN connection_name SET DEFAULT 'WhatsApp',
  ALTER COLUMN connection_name SET NOT NULL;

ALTER TABLE public.whatsapp_config
  DROP CONSTRAINT IF EXISTS whatsapp_config_connection_name_check;
ALTER TABLE public.whatsapp_config
  ADD CONSTRAINT whatsapp_config_connection_name_check
  CHECK (length(trim(connection_name)) BETWEEN 1 AND 60);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_config_default_per_account
  ON public.whatsapp_config(account_id)
  WHERE is_default;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_qr_phone_unique
  ON public.whatsapp_config(display_phone)
  WHERE provider = 'whatsapp_web' AND display_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_account_provider
  ON public.whatsapp_config(account_id, provider, created_at);

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_channel_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_channels INTEGER;
  current_channels INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.account_id::TEXT, 19));

  SELECT plan.max_channels
  INTO allowed_channels
  FROM public.accounts account
  JOIN public.saas_plans plan ON plan.code = account.plan_code
  WHERE account.id = NEW.account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ACCOUNT_PLAN_NOT_FOUND';
  END IF;

  IF allowed_channels IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    (SELECT COUNT(*) FROM public.whatsapp_config config
      WHERE config.account_id = NEW.account_id)
    +
    (SELECT COUNT(*) FROM public.channel_connections connection
      WHERE connection.account_id = NEW.account_id)
  INTO current_channels;

  IF current_channels >= allowed_channels THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLAN_CHANNEL_LIMIT_REACHED',
      DETAIL = format(
        'The account plan allows %s channels and already has %s.',
        allowed_channels,
        current_channels
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_whatsapp_channel_limit
  ON public.whatsapp_config;
CREATE TRIGGER enforce_whatsapp_channel_limit
  BEFORE INSERT OR UPDATE OF account_id ON public.whatsapp_config
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_whatsapp_channel_limit();

-- The platform overview previously joined whatsapp_config directly because
-- there could only be one row. Pick one representative connection now so a
-- company still appears exactly once in the SaaS control panel.
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

ALTER FUNCTION public.platform_account_overview() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.platform_account_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_account_overview() TO service_role;

NOTIFY pgrst, 'reload schema';
