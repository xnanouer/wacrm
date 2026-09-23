-- Agents may manage the complete lifecycle of contracts they created.
-- Administrators keep company-wide deletion rights.

DROP POLICY IF EXISTS contracts_delete ON public.contracts;
CREATE POLICY contracts_delete ON public.contracts
  FOR DELETE USING (
    public.current_account_role(account_id) IN ('owner', 'admin')
    OR created_by_user_id = auth.uid()
  );
