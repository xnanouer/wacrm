-- Persist the retention decision on each quote so administrators and the
-- cleanup worker can audit the exact planned deletion date.
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS scheduled_deletion_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_quotation_scheduled_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.scheduled_deletion_at := CASE
    WHEN NEW.deletion_hold OR NEW.status = 'financing_pending' THEN NULL
    WHEN NEW.status = 'draft' THEN NOW() + INTERVAL '7 days'
    WHEN NEW.status = 'generated' THEN COALESCE(NEW.generated_at, NOW()) + INTERVAL '15 days'
    WHEN NEW.status = 'sent' THEN COALESCE(NEW.last_sent_at, NOW()) + INTERVAL '30 days'
    WHEN NEW.status = 'expired' THEN NOW() + INTERVAL '15 days'
    WHEN NEW.status = 'rejected' THEN COALESCE(NEW.rejected_at, NOW()) + INTERVAL '15 days'
    WHEN NEW.status = 'contract_completed' THEN COALESCE(NEW.completed_at, NOW()) + INTERVAL '7 days'
    ELSE NULL
  END;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_quotation_scheduled_deletion() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_quotation_scheduled_deletion() FROM PUBLIC;

-- Backfill without creating artificial "updated" activity events or changing
-- the business updated_at timestamp of existing quotes.
ALTER TABLE public.quotations DISABLE TRIGGER audit_quotation_change;
ALTER TABLE public.quotations DISABLE TRIGGER set_updated_at;

UPDATE public.quotations
SET scheduled_deletion_at = CASE
  WHEN deletion_hold OR status = 'financing_pending' THEN NULL
  WHEN status = 'draft' THEN updated_at + INTERVAL '7 days'
  WHEN status = 'generated' THEN COALESCE(generated_at, updated_at) + INTERVAL '15 days'
  WHEN status = 'sent' THEN COALESCE(last_sent_at, updated_at) + INTERVAL '30 days'
  WHEN status = 'expired' THEN updated_at + INTERVAL '15 days'
  WHEN status = 'rejected' THEN COALESCE(rejected_at, updated_at) + INTERVAL '15 days'
  WHEN status = 'contract_completed' THEN COALESCE(completed_at, updated_at) + INTERVAL '7 days'
  ELSE NULL
END;

ALTER TABLE public.quotations ENABLE TRIGGER set_updated_at;
ALTER TABLE public.quotations ENABLE TRIGGER audit_quotation_change;

DROP TRIGGER IF EXISTS set_quotation_scheduled_deletion ON public.quotations;
CREATE TRIGGER set_quotation_scheduled_deletion
  BEFORE INSERT OR UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.set_quotation_scheduled_deletion();

CREATE INDEX IF NOT EXISTS idx_quotations_scheduled_deletion
  ON public.quotations(scheduled_deletion_at)
  WHERE scheduled_deletion_at IS NOT NULL AND deletion_hold = FALSE;

NOTIFY pgrst, 'reload schema';
