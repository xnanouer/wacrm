-- Enforce the same plan channel limit for Facebook and Instagram that is
-- already enforced for WhatsApp connections.
--
-- Disconnected social rows keep their history but do not consume a plan slot.
-- Reauthorizing one of those rows checks capacity before it becomes active.

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
      WHERE connection.account_id = NEW.account_id
        AND connection.status <> 'disconnected')
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

DROP TRIGGER IF EXISTS enforce_social_channel_limit
  ON public.channel_connections;
CREATE TRIGGER enforce_social_channel_limit
  BEFORE INSERT OR UPDATE OF account_id, status
  ON public.channel_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_whatsapp_channel_limit();

NOTIFY pgrst, 'reload schema';
