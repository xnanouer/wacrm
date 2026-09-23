-- ============================================================
-- 065_mercado_pago_billing.sql
-- Mercado Pago platform configuration and auditable billing records.
-- No company is charged by this migration.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_payment_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'mercadopago'
    CHECK (provider = 'mercadopago'),
  environment TEXT NOT NULL DEFAULT 'test'
    CHECK (environment IN ('test', 'production')),
  encrypted_access_token TEXT,
  access_token_last_four TEXT CHECK (
    access_token_last_four IS NULL OR length(access_token_last_four) = 4
  ),
  encrypted_webhook_secret TEXT,
  webhook_secret_last_four TEXT CHECK (
    webhook_secret_last_four IS NULL OR length(webhook_secret_last_four) = 4
  ),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_payment_settings_enabled_check CHECK (
    NOT enabled OR (
      encrypted_access_token IS NOT NULL
      AND encrypted_webhook_secret IS NOT NULL
    )
  )
);

INSERT INTO public.platform_payment_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS set_updated_at ON public.platform_payment_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.platform_payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.platform_payment_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_payment_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.platform_payment_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.billing_checkout_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('subscription', 'points')),
  plan_code TEXT REFERENCES public.saas_plans(code),
  point_package_id TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'CLP' CHECK (currency ~ '^[A-Z]{3}$'),
  provider TEXT NOT NULL DEFAULT 'mercadopago',
  provider_reference TEXT,
  redirect_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending', 'redirected', 'approved', 'rejected', 'canceled', 'expired'
    )
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
    jsonb_typeof(metadata) = 'object'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT billing_checkout_intent_product_check CHECK (
    (kind = 'subscription' AND plan_code IS NOT NULL AND point_package_id IS NULL)
    OR
    (kind = 'points' AND point_package_id IS NOT NULL AND plan_code IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_provider_reference_unique
  ON public.billing_checkout_intents(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_checkout_account_created_idx
  ON public.billing_checkout_intents(account_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.billing_checkout_intents;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.billing_checkout_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.billing_checkout_intents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_checkout_intents_select ON public.billing_checkout_intents;
CREATE POLICY billing_checkout_intents_select
  ON public.billing_checkout_intents FOR SELECT
  USING (
    public.is_account_profile_member(account_id)
    AND public.current_account_role(account_id)::TEXT IN ('owner', 'admin')
  );
REVOKE ALL ON TABLE public.billing_checkout_intents FROM anon, authenticated;
GRANT SELECT ON TABLE public.billing_checkout_intents TO authenticated;
GRANT ALL ON TABLE public.billing_checkout_intents TO service_role;

CREATE TABLE IF NOT EXISTS public.billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  checkout_intent_id UUID REFERENCES public.billing_checkout_intents(id)
    ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'mercadopago',
  provider_payment_id TEXT NOT NULL,
  provider_subscription_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('subscription', 'points')),
  status TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'CLP' CHECK (currency ~ '^[A-Z]{3}$'),
  status_detail TEXT,
  paid_at TIMESTAMPTZ,
  raw_summary JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
    jsonb_typeof(raw_summary) = 'object'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_payment_provider_unique UNIQUE (
    provider, provider_payment_id
  )
);

CREATE INDEX IF NOT EXISTS billing_payments_account_created_idx
  ON public.billing_payments(account_id, created_at DESC);

-- A provider payment may be retried by the webhook and by the browser return
-- route. This index makes the point grant itself idempotent as a final guard.
CREATE UNIQUE INDEX IF NOT EXISTS ai_point_grants_purchase_reference_unique
  ON public.ai_point_grants(account_id, reference)
  WHERE source = 'purchase' AND reference IS NOT NULL;
DROP TRIGGER IF EXISTS set_updated_at ON public.billing_payments;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.billing_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_payments_select ON public.billing_payments;
CREATE POLICY billing_payments_select
  ON public.billing_payments FOR SELECT
  USING (
    public.is_account_profile_member(account_id)
    AND public.current_account_role(account_id)::TEXT IN ('owner', 'admin')
  );
REVOKE ALL ON TABLE public.billing_payments FROM anon, authenticated;
GRANT SELECT ON TABLE public.billing_payments TO authenticated;
GRANT ALL ON TABLE public.billing_payments TO service_role;

CREATE TABLE IF NOT EXISTS public.billing_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'mercadopago',
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  live_mode BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'received' CHECK (
    status IN ('received', 'processing', 'processed', 'ignored', 'failed')
  ),
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT billing_provider_event_unique UNIQUE (
    provider, provider_event_id
  )
);

ALTER TABLE public.billing_provider_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_provider_events FROM anon, authenticated;
GRANT ALL ON TABLE public.billing_provider_events TO service_role;

NOTIFY pgrst, 'reload schema';
