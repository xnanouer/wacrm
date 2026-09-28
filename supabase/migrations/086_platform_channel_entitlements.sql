-- Owner-managed channel benefits.
-- Extra slots are added to the plan limit and are enforced for WhatsApp,
-- Facebook Messenger, and Instagram by the same database guard.

BEGIN;

SET search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS public.account_channel_entitlements (
  account_id         UUID PRIMARY KEY
                     REFERENCES public.accounts(id) ON DELETE CASCADE,
  extra_channels     INTEGER NOT NULL DEFAULT 0
                     CHECK (extra_channels BETWEEN 0 AND 10000),
  source             TEXT NOT NULL DEFAULT 'manual'
                     CHECK (source IN (
                       'manual', 'billing', 'promotion', 'migration'
                     )),
  updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_updated_at
  ON public.account_channel_entitlements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.account_channel_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.account_channel_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_channel_entitlements FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.account_channel_entitlements TO service_role;

CREATE OR REPLACE FUNCTION public.channel_capacity_limit(
  target_account_id UUID
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT CASE
    WHEN plan.max_channels IS NULL THEN NULL
    ELSE plan.max_channels + COALESCE(entitlement.extra_channels, 0)
  END
  FROM public.accounts account
  JOIN public.saas_plans plan ON plan.code = account.plan_code
  LEFT JOIN public.account_channel_entitlements entitlement
    ON entitlement.account_id = account.id
  WHERE account.id = target_account_id;
$$;

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
  ) + (
    SELECT COUNT(*)::INTEGER
    FROM public.channel_connections connection
    WHERE connection.account_id = target_account_id
      AND connection.status <> 'disconnected'
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_channel_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  allowed_channels INTEGER;
  current_channels INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'whatsapp_config'
     AND TG_OP = 'UPDATE'
     AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'channel_connections' THEN
    IF NEW.status = 'disconnected' THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id
       AND OLD.status <> 'disconnected' THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.account_id::TEXT, 19));

  allowed_channels := public.channel_capacity_limit(NEW.account_id);
  IF allowed_channels IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.accounts account
      JOIN public.saas_plans plan ON plan.code = account.plan_code
      WHERE account.id = NEW.account_id
        AND plan.max_channels IS NULL
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ACCOUNT_PLAN_NOT_FOUND';
  END IF;

  current_channels := public.channel_active_usage(NEW.account_id);
  IF current_channels >= allowed_channels THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLAN_CHANNEL_LIMIT_REACHED',
      DETAIL = format(
        'The account allows %s channels and already has %s.',
        allowed_channels,
        current_channels
      );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_channel_entitlement_reduction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  target_account_id UUID;
  base_limit INTEGER;
  next_limit INTEGER;
  current_usage INTEGER;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'channel_entitlement_account_cannot_change'
      USING ERRCODE = '42501';
  END IF;

  target_account_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.account_id
    ELSE NEW.account_id
  END;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(target_account_id::TEXT, 19)
  );

  SELECT plan.max_channels INTO base_limit
  FROM public.accounts account
  JOIN public.saas_plans plan ON plan.code = account.plan_code
  WHERE account.id = target_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'channel_account_plan_not_found'
      USING ERRCODE = '22023';
  END IF;
  IF base_limit IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  next_limit := base_limit + CASE
    WHEN TG_OP = 'DELETE' THEN 0
    ELSE NEW.extra_channels
  END;
  current_usage := public.channel_active_usage(target_account_id);

  IF current_usage > next_limit THEN
    RAISE EXCEPTION 'channel_capacity_reduction_conflict'
      USING
        ERRCODE = 'P0001',
        DETAIL = format(
          'The account uses %s channels and the proposed limit is %s.',
          current_usage,
          next_limit
        );
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS guard_channel_entitlement_reduction
  ON public.account_channel_entitlements;
CREATE TRIGGER guard_channel_entitlement_reduction
  BEFORE UPDATE OF account_id, extra_channels OR DELETE
  ON public.account_channel_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.guard_channel_entitlement_reduction();

ALTER FUNCTION public.channel_capacity_limit(UUID) OWNER TO postgres;
ALTER FUNCTION public.channel_active_usage(UUID) OWNER TO postgres;
ALTER FUNCTION public.enforce_whatsapp_channel_limit() OWNER TO postgres;
ALTER FUNCTION public.guard_channel_entitlement_reduction() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.channel_capacity_limit(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.channel_active_usage(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_channel_entitlement_reduction()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_whatsapp_channel_limit
  ON public.whatsapp_config;
CREATE TRIGGER enforce_whatsapp_channel_limit
  BEFORE INSERT OR UPDATE OF account_id ON public.whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION public.enforce_whatsapp_channel_limit();

DROP TRIGGER IF EXISTS enforce_social_channel_limit
  ON public.channel_connections;
CREATE TRIGGER enforce_social_channel_limit
  BEFORE INSERT OR UPDATE OF account_id, status
  ON public.channel_connections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_whatsapp_channel_limit();

NOTIFY pgrst, 'reload schema';

COMMIT;
