-- Ensure companies created after the quotation module was installed receive
-- their account-scoped defaults before the first agent opens the editor.
CREATE OR REPLACE FUNCTION public.initialize_quotation_settings_for_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.quotation_settings (account_id, company_display_name)
  VALUES (NEW.id, COALESCE(NULLIF(trim(NEW.name), ''), 'Nexora CRM'))
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.initialize_quotation_settings_for_account() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.initialize_quotation_settings_for_account() FROM PUBLIC;

DROP TRIGGER IF EXISTS initialize_quotation_settings_for_account ON public.accounts;
CREATE TRIGGER initialize_quotation_settings_for_account
  AFTER INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.initialize_quotation_settings_for_account();
