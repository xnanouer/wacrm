-- ============================================================
-- 050_commercial_plan_catalog.sql
-- Align the authoritative SaaS catalogue with Nexora's approved
-- commercial plans. Existing account plan codes remain unchanged.
--
-- This migration:
--   * does not process payments;
--   * does not create invoices or payment methods;
--   * does not activate AI audio;
--   * does not shorten trials that already have an end date.
-- ============================================================

SET search_path = public, pg_catalog;

-- Fail before changing the catalogue if an existing company would be left
-- above its new user or combined-channel allowance.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.accounts account
    JOIN (
      VALUES
        ('trial'::TEXT, 3, 1),
        ('starter'::TEXT, 3, 1),
        ('professional'::TEXT, 10, 3),
        ('enterprise'::TEXT, 25, 10)
    ) AS limits(plan_code, max_users, max_channels)
      ON limits.plan_code = account.plan_code
    WHERE (
      SELECT COUNT(*)
      FROM public.profiles profile
      WHERE profile.account_id = account.id
    ) > limits.max_users
    OR (
      (
        SELECT COUNT(*)
        FROM public.whatsapp_config whatsapp
        WHERE whatsapp.account_id = account.id
      )
      +
      (
        SELECT COUNT(*)
        FROM public.channel_connections social
        WHERE social.account_id = account.id
          AND social.status <> 'disconnected'
      )
    ) > limits.max_channels
  ) THEN
    RAISE EXCEPTION
      'PLAN_CATALOG_LIMIT_CONFLICT: an existing account exceeds the approved limits'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

ALTER TABLE public.saas_plans
  DROP CONSTRAINT IF EXISTS saas_plans_monthly_price_nonnegative;
ALTER TABLE public.saas_plans
  ADD CONSTRAINT saas_plans_monthly_price_nonnegative
  CHECK (monthly_price IS NULL OR monthly_price >= 0);

INSERT INTO public.saas_plans (
  code,
  name,
  description,
  monthly_price,
  currency,
  max_users,
  max_channels,
  ai_monthly_points,
  is_active
)
VALUES
  (
    'trial',
    'Prueba',
    'Prueba gratuita de Nexora durante 3 días',
    0,
    'CLP',
    3,
    1,
    3500,
    TRUE
  ),
  (
    'starter',
    'Starter',
    'Para pequeños negocios y equipos que comienzan a automatizar su atención',
    79990,
    'CLP',
    3,
    1,
    3500,
    TRUE
  ),
  (
    'professional',
    'Pro',
    'Para equipos comerciales que atienden clientes desde múltiples canales',
    159990,
    'CLP',
    10,
    3,
    15000,
    TRUE
  ),
  (
    'enterprise',
    'Business',
    'Para empresas con alto volumen, múltiples equipos y operación avanzada',
    349990,
    'CLP',
    25,
    10,
    40000,
    TRUE
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price = EXCLUDED.monthly_price,
  currency = EXCLUDED.currency,
  max_users = EXCLUDED.max_users,
  max_channels = EXCLUDED.max_channels,
  ai_monthly_points = EXCLUDED.ai_monthly_points,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- New accounts receive a three-day trial. Existing trial_ends_at values are
-- intentionally preserved.
ALTER TABLE public.accounts
  ALTER COLUMN trial_ends_at
  SET DEFAULT (NOW() + INTERVAL '3 days');

-- These audio actions remain disabled until the platform audio integration is
-- explicitly completed and enabled. Updating their rates now keeps the
-- authoritative catalogue aligned with the customer-facing explanation.
UPDATE public.ai_point_action_costs
SET points_per_unit = CASE action_key
  WHEN 'audio_transcription' THEN 2
  WHEN 'audio_generation' THEN 5
  ELSE points_per_unit
END,
updated_at = NOW()
WHERE action_key IN ('audio_transcription', 'audio_generation');

NOTIFY pgrst, 'reload schema';
