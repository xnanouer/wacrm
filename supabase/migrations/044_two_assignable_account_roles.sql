-- Nexora exposes two assignable workspace roles: administrator and agent.
--
-- `owner` deliberately remains in the enum as an internal marker for the
-- primary administrator. Existing supervisor/viewer rows are not rewritten
-- automatically because silently increasing or decreasing their privileges
-- would be unsafe. They can be normalized explicitly from the members panel.

CREATE OR REPLACE FUNCTION public.enforce_assignable_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_role IN ('supervisor', 'viewer')
     AND (
       TG_OP = 'INSERT'
       OR NEW.account_role IS DISTINCT FROM OLD.account_role
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_MEMBER_ROLE',
      DETAIL = 'Only admin and agent may be assigned to workspace members.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_assignable_profile_role
  ON public.profiles;
CREATE TRIGGER enforce_assignable_profile_role
  BEFORE INSERT OR UPDATE OF account_role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_assignable_profile_role();

CREATE OR REPLACE FUNCTION public.enforce_assignable_invitation_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role NOT IN ('admin', 'agent') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_INVITATION_ROLE',
      DETAIL = 'Only admin and agent invitations are supported.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_assignable_invitation_role
  ON public.account_invitations;
CREATE TRIGGER enforce_assignable_invitation_role
  BEFORE INSERT OR UPDATE OF role ON public.account_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_assignable_invitation_role();

NOTIFY pgrst, 'reload schema';
