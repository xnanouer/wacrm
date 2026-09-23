-- 040_plan_downgrade_user_guard.sql
-- Prevent assigning a plan whose seat capacity is below the company's
-- current member count. This complements the profile trigger from 039.

CREATE OR REPLACE FUNCTION public.enforce_plan_user_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_users INTEGER;
  v_current_users INTEGER;
BEGIN
  IF NEW.plan_code IS NOT DISTINCT FROM OLD.plan_code THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id::TEXT, 0));

  SELECT sp.max_users
  INTO v_max_users
  FROM public.saas_plans sp
  WHERE sp.code = NEW.plan_code
    AND sp.is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TARGET_PLAN_NOT_FOUND';
  END IF;

  IF v_max_users IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_current_users
  FROM public.profiles p
  WHERE p.account_id = NEW.id;

  IF v_current_users > v_max_users THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLAN_USER_LIMIT_EXCEEDED',
      DETAIL = format(
        'The target plan allows %s users but the account currently has %s.',
        v_max_users,
        v_current_users
      );
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_plan_user_capacity() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_plan_user_capacity() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_plan_user_capacity ON public.accounts;
CREATE TRIGGER enforce_plan_user_capacity
  BEFORE UPDATE OF plan_code ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_user_capacity();

NOTIFY pgrst, 'reload schema';
