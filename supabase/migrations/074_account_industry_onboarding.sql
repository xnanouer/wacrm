-- ============================================================
-- 074_account_industry_onboarding.sql
-- Account-scoped company onboarding and industry context.
-- Existing accounts remain completed; only accounts created after this
-- migration receive onboarding_completed = false.
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS business_subtype TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_answers JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Compatibility boundary: accounts that already existed before onboarding
-- must continue entering Nexora without interruption.
UPDATE public.accounts
SET onboarding_completed = TRUE
WHERE onboarding_completed IS NULL;

ALTER TABLE public.accounts
  ALTER COLUMN onboarding_completed SET DEFAULT FALSE,
  ALTER COLUMN onboarding_completed SET NOT NULL;

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_industry_check,
  DROP CONSTRAINT IF EXISTS accounts_business_subtype_check,
  DROP CONSTRAINT IF EXISTS accounts_onboarding_answers_object_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_industry_check CHECK (
    industry IS NULL OR industry IN ('automotive', 'real_estate_construction')
  ),
  ADD CONSTRAINT accounts_business_subtype_check CHECK (
    business_subtype IS NULL OR business_subtype IN (
      'construction_company',
      'real_estate_agency',
      'construction_and_real_estate'
    )
  ),
  ADD CONSTRAINT accounts_onboarding_answers_object_check CHECK (
    jsonb_typeof(onboarding_answers) = 'object'
  );

CREATE INDEX IF NOT EXISTS idx_accounts_industry
  ON public.accounts(industry)
  WHERE industry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_pending_onboarding
  ON public.accounts(created_at)
  WHERE onboarding_completed = FALSE;

COMMENT ON COLUMN public.accounts.industry IS
  'Enabled Nexora industry configuration for this account.';
COMMENT ON COLUMN public.accounts.business_subtype IS
  'Optional industry-specific company subtype.';
COMMENT ON COLUMN public.accounts.onboarding_completed IS
  'Account-level onboarding gate. Existing accounts were backfilled true.';
COMMENT ON COLUMN public.accounts.onboarding_answers IS
  'Sanitized business answers and temporary onboarding progress.';
