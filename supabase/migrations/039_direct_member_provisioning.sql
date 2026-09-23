-- 039_direct_member_provisioning.sql
-- Direct, administrator-created users with plan seat enforcement.
--
-- The browser never receives the service-role key. A protected Next.js route
-- creates the Supabase Auth user, then calls provision_account_member() to
-- attach that new identity to the administrator's company. The trigger below
-- is the final guard against races and alternative write paths (including old
-- invitation links): a plan with five seats can never acquire a sixth profile.

CREATE OR REPLACE FUNCTION public.enforce_account_user_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_users INTEGER;
  v_current_users INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id THEN
    RETURN NEW;
  END IF;

  -- Serialize seat claims for this company. A row lock alone is not enough
  -- when two profile writes count existing seats before either one commits.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.account_id::TEXT, 0));

  SELECT sp.max_users
  INTO v_max_users
  FROM public.accounts a
  JOIN public.saas_plans sp ON sp.code = a.plan_code
  WHERE a.id = NEW.account_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACCOUNT_PLAN_NOT_FOUND';
  END IF;

  -- NULL means a custom/unlimited Enterprise plan.
  IF v_max_users IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_current_users
  FROM public.profiles p
  WHERE p.account_id = NEW.account_id
    AND p.user_id <> NEW.user_id;

  IF v_current_users >= v_max_users THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLAN_USER_LIMIT_REACHED',
      DETAIL = format(
        'The account plan allows %s users and already has %s.',
        v_max_users,
        v_current_users
      );
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_account_user_limit() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_account_user_limit() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_account_user_limit ON public.profiles;
CREATE TRIGGER enforce_account_user_limit
  BEFORE INSERT OR UPDATE OF account_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_account_user_limit();

CREATE OR REPLACE FUNCTION public.provision_account_member(
  p_user_id UUID,
  p_target_account_id UUID,
  p_role account_role_enum,
  p_department_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_account_id UUID;
  v_source_role account_role_enum;
  v_target_max_users INTEGER;
  v_current_users INTEGER;
  v_requested_departments INTEGER;
  v_valid_departments INTEGER;
BEGIN
  IF p_role = 'owner' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_MEMBER_ROLE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_target_account_id::TEXT, 0));

  SELECT sp.max_users
  INTO v_target_max_users
  FROM public.accounts a
  JOIN public.saas_plans sp ON sp.code = a.plan_code
  WHERE a.id = p_target_account_id
  FOR UPDATE OF a;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TARGET_ACCOUNT_NOT_FOUND';
  END IF;

  SELECT p.account_id, p.account_role
  INTO v_source_account_id, v_source_role
  FROM public.profiles p
  WHERE p.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROVISIONED_PROFILE_NOT_FOUND';
  END IF;

  -- Auth admin.createUser() runs the normal signup trigger first. Only a new
  -- user's untouched personal account may be claimed by this function.
  IF v_source_account_id = p_target_account_id
     OR v_source_role <> 'owner'
     OR NOT EXISTS (
       SELECT 1
       FROM public.accounts a
       WHERE a.id = v_source_account_id
         AND a.owner_user_id = p_user_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'USER_CANNOT_BE_PROVISIONED';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_current_users
  FROM public.profiles p
  WHERE p.account_id = p_target_account_id;

  IF v_target_max_users IS NOT NULL AND v_current_users >= v_target_max_users THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLAN_USER_LIMIT_REACHED',
      DETAIL = format(
        'The account plan allows %s users and already has %s.',
        v_target_max_users,
        v_current_users
      );
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_requested_departments
  FROM (SELECT DISTINCT unnest(COALESCE(p_department_ids, ARRAY[]::UUID[])) AS id) requested;

  SELECT COUNT(*)::INTEGER
  INTO v_valid_departments
  FROM public.departments d
  WHERE d.account_id = p_target_account_id
    AND d.is_active = TRUE
    AND d.id = ANY(COALESCE(p_department_ids, ARRAY[]::UUID[]));

  IF v_requested_departments <> v_valid_departments THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_DEPARTMENT_SELECTION';
  END IF;

  UPDATE public.profiles
  SET account_id = p_target_account_id,
      account_role = p_role,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.department_members (
    account_id,
    department_id,
    user_id,
    member_role,
    is_active
  )
  SELECT
    p_target_account_id,
    department_id,
    p_user_id,
    CASE WHEN p_role = 'supervisor' THEN 'supervisor' ELSE 'member' END,
    TRUE
  FROM (
    SELECT DISTINCT unnest(COALESCE(p_department_ids, ARRAY[]::UUID[])) AS department_id
  ) selected
  ON CONFLICT (department_id, user_id)
  DO UPDATE SET
    member_role = EXCLUDED.member_role,
    is_active = TRUE;

  -- The personal account was created only as part of the standard signup
  -- bootstrap. Once its sole profile moves, remove that empty shell.
  DELETE FROM public.accounts a
  WHERE a.id = v_source_account_id
    AND a.owner_user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.account_id = a.id
    );

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'account_id', p_target_account_id,
    'role', p_role,
    'current_users', v_current_users + 1,
    'max_users', v_target_max_users
  );
END;
$$;

ALTER FUNCTION public.provision_account_member(UUID, UUID, account_role_enum, UUID[])
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.provision_account_member(UUID, UUID, account_role_enum, UUID[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_account_member(UUID, UUID, account_role_enum, UUID[])
  TO service_role;

NOTIFY pgrst, 'reload schema';
