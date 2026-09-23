-- Tenant settings need to display the public limits of the active plans.
-- This exposes plan catalogue rows only; it does not expose subscriptions,
-- billing identifiers, accounts, or any other tenant's data.

DROP POLICY IF EXISTS saas_plans_authenticated_read ON public.saas_plans;
CREATE POLICY saas_plans_authenticated_read
  ON public.saas_plans
  FOR SELECT
  TO authenticated
  USING (is_active);

NOTIFY pgrst, 'reload schema';
