-- ============================================================
-- 049_managed_ai_points.sql
-- Managed Nexora AI credentials, per-company enablement, monthly
-- included points, additional grants, and an auditable reservation
-- ledger.
--
-- IMPORTANT
--   * This migration does not call an AI provider.
--   * This migration does not implement transcription or speech.
--   * Provider credentials remain server-only.
--   * Every provider call must reserve points first, then either
--     finalize or release that reservation.
--   * Monthly points never roll over. Additional grants are tracked
--     separately and may optionally expire.
--
-- Apply after 048_security_hardening.sql.
-- ============================================================

SET search_path = public, pg_catalog;

-- ------------------------------------------------------------
-- Existing tenant AI configuration becomes behaviour-only.
-- Legacy encrypted BYOK values are preserved for rollback/audit but
-- the managed runtime must stop reading them after the application
-- changes land.
-- ------------------------------------------------------------

ALTER TABLE public.ai_configs
  ALTER COLUMN api_key DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS response_mode TEXT NOT NULL DEFAULT 'text';

ALTER TABLE public.ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_response_mode_check;
ALTER TABLE public.ai_configs
  ADD CONSTRAINT ai_configs_response_mode_check
  CHECK (response_mode IN ('text', 'audio', 'match_inbound'));

-- ------------------------------------------------------------
-- Plan allowance. The existing database plan codes are retained so
-- no active company is renamed or moved by this migration.
-- ------------------------------------------------------------

ALTER TABLE public.saas_plans
  ADD COLUMN IF NOT EXISTS ai_monthly_points BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.saas_plans
  DROP CONSTRAINT IF EXISTS saas_plans_ai_monthly_points_check;
ALTER TABLE public.saas_plans
  ADD CONSTRAINT saas_plans_ai_monthly_points_check
  CHECK (ai_monthly_points >= 0);

UPDATE public.saas_plans
SET ai_monthly_points = CASE code
  WHEN 'trial' THEN 0
  WHEN 'starter' THEN 3500
  WHEN 'professional' THEN 15000
  WHEN 'enterprise' THEN 40000
  ELSE ai_monthly_points
END
WHERE code IN ('trial', 'starter', 'professional', 'enterprise');

-- ------------------------------------------------------------
-- Singleton platform-owned provider configuration.
--
-- encrypted_api_key contains an application-encrypted value. The
-- plaintext key must never be persisted, selected by a tenant, sent
-- to a browser, or written to logs.
--
-- Audio columns prepare the data model only. audio_enabled remains
-- false until a real server-side transcription/speech integration is
-- implemented and explicitly enabled by the platform owner.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_ai_settings (
  id                    SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  text_provider         TEXT CHECK (text_provider IN ('openai', 'anthropic')),
  text_model            TEXT,
  encrypted_api_key     TEXT,
  api_key_last_four     TEXT CHECK (
    api_key_last_four IS NULL OR length(api_key_last_four) = 4
  ),
  transcription_model   TEXT,
  speech_model          TEXT,
  speech_voice          TEXT,
  global_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  audio_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_ai_settings_enabled_config_check CHECK (
    NOT global_enabled OR (
      text_provider IS NOT NULL
      AND length(trim(text_model)) > 0
      AND length(trim(encrypted_api_key)) > 0
    )
  ),
  CONSTRAINT platform_ai_settings_audio_config_check CHECK (
    NOT audio_enabled OR (
      global_enabled
      AND text_provider = 'openai'
      AND length(trim(transcription_model)) > 0
      AND length(trim(speech_model)) > 0
      AND length(trim(speech_voice)) > 0
    )
  )
);

INSERT INTO public.platform_ai_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS set_updated_at ON public.platform_ai_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.platform_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.platform_ai_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_ai_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.platform_ai_settings TO service_role;

-- ------------------------------------------------------------
-- Central action catalogue. A fixed action consumes its configured
-- amount. A per-minute action uses:
--
--   ceil(duration_ms * points_per_unit / 60000)
--
-- Duration limits are safety limits, not billing-plan limits.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_point_action_costs (
  action_key             TEXT PRIMARY KEY CHECK (
    action_key ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  customer_label         TEXT NOT NULL CHECK (
    length(trim(customer_label)) BETWEEN 2 AND 100
  ),
  category               TEXT NOT NULL CHECK (
    category IN ('text', 'analysis', 'audio')
  ),
  billing_unit           TEXT NOT NULL CHECK (
    billing_unit IN ('fixed', 'per_minute')
  ),
  points_per_unit        BIGINT NOT NULL CHECK (points_per_unit > 0),
  max_duration_seconds   INTEGER,
  enabled                BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_point_action_costs_duration_check CHECK (
    (billing_unit = 'fixed' AND max_duration_seconds IS NULL)
    OR
    (
      billing_unit = 'per_minute'
      AND max_duration_seconds IS NOT NULL
      AND max_duration_seconds > 0
    )
  )
);

INSERT INTO public.ai_point_action_costs (
  action_key,
  customer_label,
  category,
  billing_unit,
  points_per_unit,
  max_duration_seconds,
  sort_order
)
VALUES
  ('automatic_text_reply', 'Respuesta automatica', 'text', 'fixed', 1, NULL, 10),
  ('suggested_reply', 'Respuesta sugerida', 'text', 'fixed', 1, NULL, 20),
  ('conversation_summary', 'Resumen de conversacion', 'analysis', 'fixed', 1, NULL, 30),
  ('lead_analysis', 'Analisis de lead', 'analysis', 'fixed', 1, NULL, 40),
  ('audio_transcription', 'Transcripcion de audio', 'audio', 'per_minute', 10, 900, 50),
  ('audio_generation', 'Respuesta de audio', 'audio', 'per_minute', 10, 300, 60)
ON CONFLICT (action_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_ai_point_action_costs_category
  ON public.ai_point_action_costs(category, enabled, sort_order);

DROP TRIGGER IF EXISTS set_updated_at ON public.ai_point_action_costs;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.ai_point_action_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_point_action_costs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_point_action_costs FROM anon, authenticated;
GRANT ALL ON TABLE public.ai_point_action_costs TO service_role;

-- ------------------------------------------------------------
-- Platform entitlement. This switch is independent from
-- ai_configs.is_active:
--
--   platform_enabled  -> only Nexora platform owner controls access
--   ai_configs active -> company admin may pause its own assistant
--
-- The optional override replaces the plan allowance when a new
-- monthly cycle is created; it does not rewrite historical cycles.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_ai_entitlements (
  account_id                UUID PRIMARY KEY
                              REFERENCES public.accounts(id) ON DELETE CASCADE,
  platform_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  disabled_reason           TEXT,
  monthly_points_override   BIGINT CHECK (
    monthly_points_override IS NULL OR monthly_points_override >= 0
  ),
  updated_by_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_ai_entitlements_enabled
  ON public.account_ai_entitlements(platform_enabled, account_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.account_ai_entitlements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.account_ai_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.account_ai_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_ai_entitlements FROM anon, authenticated;
GRANT ALL ON TABLE public.account_ai_entitlements TO service_role;

INSERT INTO public.account_ai_entitlements (account_id)
SELECT account.id
FROM public.accounts account
ON CONFLICT (account_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_account_ai_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.account_ai_entitlements (account_id)
  VALUES (NEW.id)
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.seed_account_ai_entitlement() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.seed_account_ai_entitlement()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS on_account_seed_ai_entitlement ON public.accounts;
CREATE TRIGGER on_account_seed_ai_entitlement
  AFTER INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.seed_account_ai_entitlement();

-- ------------------------------------------------------------
-- Immutable monthly buckets. A new row is created lazily for each
-- calendar month. Old rows remain for audit, and an in-flight request
-- can safely finalize against its original month after renewal.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_point_cycles (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                 UUID NOT NULL
                               REFERENCES public.accounts(id) ON DELETE CASCADE,
  cycle_started_at           TIMESTAMPTZ NOT NULL,
  cycle_ends_at              TIMESTAMPTZ NOT NULL,
  included_points            BIGINT NOT NULL CHECK (included_points >= 0),
  included_points_used       BIGINT NOT NULL DEFAULT 0 CHECK (
    included_points_used >= 0
  ),
  included_points_reserved   BIGINT NOT NULL DEFAULT 0 CHECK (
    included_points_reserved >= 0
  ),
  plan_code_snapshot         TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_point_cycles_window_check CHECK (
    cycle_ends_at > cycle_started_at
  ),
  CONSTRAINT ai_point_cycles_balance_check CHECK (
    included_points_used + included_points_reserved <= included_points
  ),
  CONSTRAINT ai_point_cycles_account_start_unique UNIQUE (
    account_id, cycle_started_at
  ),
  CONSTRAINT ai_point_cycles_id_account_unique UNIQUE (id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_point_cycles_account_period
  ON public.ai_point_cycles(account_id, cycle_ends_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.ai_point_cycles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.ai_point_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_point_cycles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_point_cycles FROM anon, authenticated;
GRANT ALL ON TABLE public.ai_point_cycles TO service_role;

-- ------------------------------------------------------------
-- Additional points remain separate from monthly points. There is no
-- payment flow in this migration; grants may only be created by a
-- future, platform-authorized server route.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_point_grants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL
                       REFERENCES public.accounts(id) ON DELETE CASCADE,
  source             TEXT NOT NULL CHECK (
    source IN ('manual', 'promotion', 'purchase', 'migration')
  ),
  original_points    BIGINT NOT NULL CHECK (original_points > 0),
  used_points        BIGINT NOT NULL DEFAULT 0 CHECK (used_points >= 0),
  reserved_points    BIGINT NOT NULL DEFAULT 0 CHECK (reserved_points >= 0),
  expires_at         TIMESTAMPTZ,
  reference          TEXT,
  granted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata           JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
    jsonb_typeof(metadata) = 'object'
  ),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_point_grants_balance_check CHECK (
    used_points + reserved_points <= original_points
  ),
  CONSTRAINT ai_point_grants_expiry_check CHECK (
    expires_at IS NULL OR expires_at > created_at
  ),
  CONSTRAINT ai_point_grants_id_account_unique UNIQUE (id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_point_grants_account_expiry
  ON public.ai_point_grants(account_id, expires_at, created_at)
  WHERE used_points + reserved_points < original_points;

ALTER TABLE public.ai_point_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_point_grants FROM anon, authenticated;
GRANT ALL ON TABLE public.ai_point_grants TO service_role;

-- ------------------------------------------------------------
-- Reservation/consumption ledger.
--
-- Cost snapshots guarantee that changing the catalogue cannot alter
-- an already-authorized operation. Context references are nullable so
-- non-conversation operations (for example Playground) remain valid.
-- The service RPC validates every supplied reference against account_id.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_point_operations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                  UUID NOT NULL
                                REFERENCES public.accounts(id) ON DELETE CASCADE,
  cycle_id                    UUID NOT NULL,
  actor_user_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_key                  TEXT NOT NULL
                                REFERENCES public.ai_point_action_costs(action_key)
                                ON UPDATE RESTRICT ON DELETE RESTRICT,
  idempotency_key             TEXT NOT NULL CHECK (
    length(trim(idempotency_key)) BETWEEN 8 AND 200
  ),
  status                      TEXT NOT NULL DEFAULT 'reserved',
  billing_unit_snapshot       TEXT NOT NULL CHECK (
    billing_unit_snapshot IN ('fixed', 'per_minute')
  ),
  points_per_unit_snapshot    BIGINT NOT NULL CHECK (
    points_per_unit_snapshot > 0
  ),
  estimated_points            BIGINT NOT NULL CHECK (estimated_points > 0),
  charged_points              BIGINT NOT NULL DEFAULT 0 CHECK (
    charged_points >= 0
  ),
  included_points_reserved    BIGINT NOT NULL DEFAULT 0 CHECK (
    included_points_reserved >= 0
  ),
  additional_points_reserved  BIGINT NOT NULL DEFAULT 0 CHECK (
    additional_points_reserved >= 0
  ),
  included_points_charged     BIGINT NOT NULL DEFAULT 0 CHECK (
    included_points_charged >= 0
  ),
  additional_points_charged   BIGINT NOT NULL DEFAULT 0 CHECK (
    additional_points_charged >= 0
  ),
  estimated_duration_ms       BIGINT CHECK (
    estimated_duration_ms IS NULL OR estimated_duration_ms > 0
  ),
  actual_duration_ms          BIGINT CHECK (
    actual_duration_ms IS NULL OR actual_duration_ms > 0
  ),
  ai_config_id                UUID REFERENCES public.ai_configs(id) ON DELETE SET NULL,
  conversation_id             UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id                  UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  whatsapp_config_id          UUID REFERENCES public.whatsapp_config(id) ON DELETE SET NULL,
  channel_connection_id       UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  source_message_id           UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  provider_request_id         TEXT,
  technical_metadata          JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
    jsonb_typeof(technical_metadata) = 'object'
  ),
  failure_reason              TEXT,
  reservation_expires_at      TIMESTAMPTZ NOT NULL DEFAULT (
    NOW() + INTERVAL '15 minutes'
  ),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at                TIMESTAMPTZ,
  CONSTRAINT ai_point_operations_cycle_account_fkey
    FOREIGN KEY (cycle_id, account_id)
    REFERENCES public.ai_point_cycles(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT ai_point_operations_account_idempotency_unique UNIQUE (
    account_id, idempotency_key
  ),
  CONSTRAINT ai_point_operations_id_account_unique UNIQUE (id, account_id),
  CONSTRAINT ai_point_operations_reserved_total_check CHECK (
    included_points_reserved + additional_points_reserved = estimated_points
  ),
  CONSTRAINT ai_point_operations_charged_total_check CHECK (
    included_points_charged + additional_points_charged = charged_points
  ),
  CONSTRAINT ai_point_operations_charge_limit_check CHECK (
    charged_points <= estimated_points
  ),
  CONSTRAINT ai_point_operations_status_check CHECK (
    (status = 'reserved' AND charged_points = 0 AND completed_at IS NULL)
    OR
    (status = 'completed' AND charged_points > 0 AND completed_at IS NOT NULL)
    OR
    (status = 'released' AND charged_points = 0 AND completed_at IS NOT NULL)
  ),
  CONSTRAINT ai_point_operations_expiry_check CHECK (
    reservation_expires_at > created_at
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_point_operations_account_created
  ON public.ai_point_operations(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_point_operations_account_status
  ON public.ai_point_operations(account_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_point_operations_conversation
  ON public.ai_point_operations(conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_point_operations_actor
  ON public.ai_point_operations(actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_point_operations_expired_reservations
  ON public.ai_point_operations(reservation_expires_at)
  WHERE status = 'reserved';

ALTER TABLE public.ai_point_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_point_operations FROM anon, authenticated;
GRANT ALL ON TABLE public.ai_point_operations TO service_role;

-- A reservation may span multiple additional grants. This mapping is
-- required to finalize or release the exact rows originally reserved.
CREATE TABLE IF NOT EXISTS public.ai_point_operation_grants (
  account_id        UUID NOT NULL
                      REFERENCES public.accounts(id) ON DELETE CASCADE,
  operation_id      UUID NOT NULL,
  grant_id          UUID NOT NULL,
  allocation_order  INTEGER NOT NULL CHECK (allocation_order > 0),
  reserved_points   BIGINT NOT NULL CHECK (reserved_points > 0),
  charged_points    BIGINT NOT NULL DEFAULT 0 CHECK (
    charged_points >= 0 AND charged_points <= reserved_points
  ),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (operation_id, grant_id),
  CONSTRAINT ai_point_operation_grants_operation_account_fkey
    FOREIGN KEY (operation_id, account_id)
    REFERENCES public.ai_point_operations(id, account_id) ON DELETE CASCADE,
  CONSTRAINT ai_point_operation_grants_grant_account_fkey
    FOREIGN KEY (grant_id, account_id)
    REFERENCES public.ai_point_grants(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT ai_point_operation_grants_order_unique UNIQUE (
    operation_id, allocation_order
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_point_operation_grants_account
  ON public.ai_point_operation_grants(account_id, created_at DESC);

ALTER TABLE public.ai_point_operation_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_point_operation_grants FROM anon, authenticated;
GRANT ALL ON TABLE public.ai_point_operation_grants TO service_role;

-- ------------------------------------------------------------
-- Shared point calculator.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_ai_points(
  p_billing_unit TEXT,
  p_points_per_unit BIGINT,
  p_duration_ms BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF p_points_per_unit IS NULL OR p_points_per_unit <= 0 THEN
    RAISE EXCEPTION 'AI_INVALID_POINT_RATE' USING ERRCODE = '22023';
  END IF;

  IF p_billing_unit = 'fixed' THEN
    RETURN p_points_per_unit;
  END IF;

  IF p_billing_unit = 'per_minute' THEN
    IF p_duration_ms IS NULL OR p_duration_ms <= 0 THEN
      RAISE EXCEPTION 'AI_DURATION_REQUIRED' USING ERRCODE = '22023';
    END IF;
    RETURN CEIL(
      (p_duration_ms::NUMERIC * p_points_per_unit::NUMERIC) / 60000
    )::BIGINT;
  END IF;

  RAISE EXCEPTION 'AI_INVALID_BILLING_UNIT' USING ERRCODE = '22023';
END;
$$;

-- ------------------------------------------------------------
-- Release an unused reservation. Idempotent for already-released
-- operations and a no-op for completed consumption.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_ai_points(
  p_operation_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_account_id UUID;
  v_operation public.ai_point_operations%ROWTYPE;
  v_allocation RECORD;
BEGIN
  SELECT operation.account_id
  INTO v_account_id
  FROM public.ai_point_operations operation
  WHERE operation.id = p_operation_id;

  IF v_account_id IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_account_id::TEXT, 49));

  SELECT operation.*
  INTO v_operation
  FROM public.ai_point_operations operation
  WHERE operation.id = p_operation_id
  FOR UPDATE;

  IF v_operation.status = 'released' THEN
    RETURN TRUE;
  END IF;

  IF v_operation.status = 'completed' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.ai_point_cycles cycle
  SET included_points_reserved =
        cycle.included_points_reserved - v_operation.included_points_reserved
  WHERE cycle.id = v_operation.cycle_id
    AND cycle.account_id = v_operation.account_id
    AND cycle.included_points_reserved >= v_operation.included_points_reserved;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_MONTHLY_RESERVATION_INCONSISTENT'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_allocation IN
    SELECT allocation.*
    FROM public.ai_point_operation_grants allocation
    WHERE allocation.operation_id = v_operation.id
    ORDER BY allocation.allocation_order
    FOR UPDATE
  LOOP
    UPDATE public.ai_point_grants grant_row
    SET reserved_points =
          grant_row.reserved_points - v_allocation.reserved_points
    WHERE grant_row.id = v_allocation.grant_id
      AND grant_row.account_id = v_operation.account_id
      AND grant_row.reserved_points >= v_allocation.reserved_points;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'AI_ADDITIONAL_RESERVATION_INCONSISTENT'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  UPDATE public.ai_point_operations
  SET status = 'released',
      failure_reason = NULLIF(trim(p_reason), ''),
      completed_at = NOW()
  WHERE id = v_operation.id;

  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------
-- Reserve before an AI provider call.
--
-- Monthly points are consumed first because they expire at renewal.
-- Additional grants are reserved next, earliest expiry first.
-- Duplicate idempotency keys return the original operation and never
-- reserve a second time.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_ai_points(
  p_account_id UUID,
  p_action_key TEXT,
  p_idempotency_key TEXT,
  p_actor_user_id UUID DEFAULT NULL,
  p_estimated_duration_ms BIGINT DEFAULT NULL,
  p_ai_config_id UUID DEFAULT NULL,
  p_conversation_id UUID DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL,
  p_whatsapp_config_id UUID DEFAULT NULL,
  p_channel_connection_id UUID DEFAULT NULL,
  p_source_message_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  operation_id UUID,
  operation_status TEXT,
  reserved_points BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_existing public.ai_point_operations%ROWTYPE;
  v_action public.ai_point_action_costs%ROWTYPE;
  v_entitlement public.account_ai_entitlements%ROWTYPE;
  v_cycle public.ai_point_cycles%ROWTYPE;
  v_expired RECORD;
  v_grant RECORD;
  v_operation_id UUID := gen_random_uuid();
  v_cycle_start TIMESTAMPTZ := date_trunc('month', NOW());
  v_cycle_end TIMESTAMPTZ := date_trunc('month', NOW()) + INTERVAL '1 month';
  v_plan_code TEXT;
  v_monthly_allowance BIGINT;
  v_points BIGINT;
  v_monthly_available BIGINT;
  v_additional_available BIGINT;
  v_included_take BIGINT;
  v_additional_take BIGINT;
  v_remaining BIGINT;
  v_grant_take BIGINT;
  v_allocation_order INTEGER := 0;
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'AI_ACCOUNT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL
     OR length(trim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'AI_INVALID_IDEMPOTENCY_KEY' USING ERRCODE = '22023';
  END IF;

  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'AI_METADATA_MUST_BE_OBJECT' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_account_id::TEXT, 49));

  SELECT operation.*
  INTO v_existing
  FROM public.ai_point_operations operation
  WHERE operation.account_id = p_account_id
    AND operation.idempotency_key = trim(p_idempotency_key);

  IF FOUND THEN
    RETURN QUERY
      SELECT v_existing.id, v_existing.status, v_existing.estimated_points;
    RETURN;
  END IF;

  -- Recover points from requests that never finalized after a process
  -- crash or provider timeout.
  FOR v_expired IN
    SELECT operation.id
    FROM public.ai_point_operations operation
    WHERE operation.account_id = p_account_id
      AND operation.status = 'reserved'
      AND operation.reservation_expires_at <= NOW()
    ORDER BY operation.reservation_expires_at
    FOR UPDATE
  LOOP
    PERFORM public.release_ai_points(
      v_expired.id,
      'reservation_expired'
    );
  END LOOP;

  IF NOT public.account_has_operational_access(p_account_id) THEN
    RAISE EXCEPTION 'AI_ACCOUNT_NOT_OPERATIONAL' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_ai_settings settings
    WHERE settings.id = 1
      AND settings.global_enabled
      AND settings.text_provider IS NOT NULL
      AND length(trim(settings.text_model)) > 0
      AND length(trim(settings.encrypted_api_key)) > 0
  ) THEN
    RAISE EXCEPTION 'AI_PLATFORM_DISABLED' USING ERRCODE = 'P0001';
  END IF;

  SELECT action.*
  INTO v_action
  FROM public.ai_point_action_costs action
  WHERE action.action_key = p_action_key
    AND action.enabled;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_ACTION_DISABLED_OR_UNKNOWN' USING ERRCODE = '22023';
  END IF;

  IF v_action.category = 'audio' AND NOT EXISTS (
    SELECT 1
    FROM public.platform_ai_settings settings
    WHERE settings.id = 1 AND settings.audio_enabled
  ) THEN
    RAISE EXCEPTION 'AI_AUDIO_DISABLED' USING ERRCODE = 'P0001';
  END IF;

  IF v_action.billing_unit = 'per_minute' AND (
    p_estimated_duration_ms IS NULL
    OR p_estimated_duration_ms <= 0
    OR p_estimated_duration_ms >
       (v_action.max_duration_seconds::BIGINT * 1000)
  ) THEN
    RAISE EXCEPTION 'AI_AUDIO_DURATION_OUT_OF_RANGE' USING ERRCODE = '22023';
  END IF;

  v_points := public.calculate_ai_points(
    v_action.billing_unit,
    v_action.points_per_unit,
    p_estimated_duration_ms
  );

  INSERT INTO public.account_ai_entitlements (account_id)
  VALUES (p_account_id)
  ON CONFLICT (account_id) DO NOTHING;

  SELECT entitlement.*
  INTO v_entitlement
  FROM public.account_ai_entitlements entitlement
  WHERE entitlement.account_id = p_account_id
  FOR UPDATE;

  IF NOT v_entitlement.platform_enabled THEN
    RAISE EXCEPTION 'AI_NOT_ENABLED_FOR_ACCOUNT' USING ERRCODE = '42501';
  END IF;

  SELECT account.plan_code,
         COALESCE(
           v_entitlement.monthly_points_override,
           plan.ai_monthly_points
         )
  INTO v_plan_code, v_monthly_allowance
  FROM public.accounts account
  JOIN public.saas_plans plan ON plan.code = account.plan_code
  WHERE account.id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_ACCOUNT_PLAN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ai_point_cycles (
    account_id,
    cycle_started_at,
    cycle_ends_at,
    included_points,
    plan_code_snapshot
  )
  VALUES (
    p_account_id,
    v_cycle_start,
    v_cycle_end,
    v_monthly_allowance,
    v_plan_code
  )
  ON CONFLICT (account_id, cycle_started_at) DO NOTHING;

  SELECT cycle.*
  INTO v_cycle
  FROM public.ai_point_cycles cycle
  WHERE cycle.account_id = p_account_id
    AND cycle.cycle_started_at = v_cycle_start
  FOR UPDATE;

  v_monthly_available :=
    v_cycle.included_points
    - v_cycle.included_points_used
    - v_cycle.included_points_reserved;

  SELECT COALESCE(
    SUM(grant_row.original_points
        - grant_row.used_points
        - grant_row.reserved_points),
    0
  )
  INTO v_additional_available
  FROM public.ai_point_grants grant_row
  WHERE grant_row.account_id = p_account_id
    AND (grant_row.expires_at IS NULL OR grant_row.expires_at > NOW())
    AND grant_row.used_points + grant_row.reserved_points
        < grant_row.original_points;

  IF v_monthly_available + v_additional_available < v_points THEN
    RAISE EXCEPTION 'AI_INSUFFICIENT_POINTS'
      USING
        ERRCODE = 'P0001',
        DETAIL = format(
          'required=%s available=%s',
          v_points,
          v_monthly_available + v_additional_available
        );
  END IF;

  -- Every optional context object must belong to this account.
  IF p_actor_user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles profile
       WHERE profile.user_id = p_actor_user_id
         AND profile.account_id = p_account_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.platform_admins platform_admin
       WHERE platform_admin.user_id = p_actor_user_id
     ) THEN
    RAISE EXCEPTION 'AI_ACTOR_ACCOUNT_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF p_ai_config_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ai_configs config
    WHERE config.id = p_ai_config_id AND config.account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'AI_CONFIG_ACCOUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF p_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations conversation
    WHERE conversation.id = p_conversation_id
      AND conversation.account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'AI_CONVERSATION_ACCOUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF p_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts contact
    WHERE contact.id = p_contact_id AND contact.account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'AI_CONTACT_ACCOUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF p_conversation_id IS NOT NULL
     AND p_contact_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.conversations conversation
       WHERE conversation.id = p_conversation_id
         AND conversation.account_id = p_account_id
         AND conversation.contact_id = p_contact_id
     ) THEN
    RAISE EXCEPTION 'AI_CONVERSATION_CONTACT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF p_whatsapp_config_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_config config
    WHERE config.id = p_whatsapp_config_id
      AND config.account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'AI_WHATSAPP_ACCOUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF p_channel_connection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.channel_connections connection
    WHERE connection.id = p_channel_connection_id
      AND connection.account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'AI_CHANNEL_ACCOUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF p_whatsapp_config_id IS NOT NULL
     AND p_channel_connection_id IS NOT NULL THEN
    RAISE EXCEPTION 'AI_MULTIPLE_CONNECTION_TYPES' USING ERRCODE = '22023';
  END IF;

  IF p_source_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.messages message
    JOIN public.conversations conversation
      ON conversation.id = message.conversation_id
    WHERE message.id = p_source_message_id
      AND conversation.account_id = p_account_id
      AND (
        p_conversation_id IS NULL
        OR conversation.id = p_conversation_id
      )
  ) THEN
    RAISE EXCEPTION 'AI_MESSAGE_ACCOUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  v_included_take := LEAST(v_points, v_monthly_available);
  v_additional_take := v_points - v_included_take;

  UPDATE public.ai_point_cycles
  SET included_points_reserved =
        included_points_reserved + v_included_take
  WHERE id = v_cycle.id;

  INSERT INTO public.ai_point_operations (
    id,
    account_id,
    cycle_id,
    actor_user_id,
    action_key,
    idempotency_key,
    billing_unit_snapshot,
    points_per_unit_snapshot,
    estimated_points,
    included_points_reserved,
    additional_points_reserved,
    estimated_duration_ms,
    ai_config_id,
    conversation_id,
    contact_id,
    whatsapp_config_id,
    channel_connection_id,
    source_message_id,
    technical_metadata
  )
  VALUES (
    v_operation_id,
    p_account_id,
    v_cycle.id,
    p_actor_user_id,
    v_action.action_key,
    trim(p_idempotency_key),
    v_action.billing_unit,
    v_action.points_per_unit,
    v_points,
    v_included_take,
    v_additional_take,
    CASE
      WHEN v_action.billing_unit = 'per_minute'
        THEN p_estimated_duration_ms
      ELSE NULL
    END,
    p_ai_config_id,
    p_conversation_id,
    p_contact_id,
    p_whatsapp_config_id,
    p_channel_connection_id,
    p_source_message_id,
    p_metadata
  );

  v_remaining := v_additional_take;

  FOR v_grant IN
    SELECT
      grant_row.id,
      grant_row.original_points
        - grant_row.used_points
        - grant_row.reserved_points AS available_points
    FROM public.ai_point_grants grant_row
    WHERE grant_row.account_id = p_account_id
      AND (grant_row.expires_at IS NULL OR grant_row.expires_at > NOW())
      AND grant_row.used_points + grant_row.reserved_points
          < grant_row.original_points
    ORDER BY grant_row.expires_at ASC NULLS LAST, grant_row.created_at, grant_row.id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;

    v_grant_take := LEAST(v_remaining, v_grant.available_points);
    v_allocation_order := v_allocation_order + 1;

    UPDATE public.ai_point_grants AS grant_row
    SET reserved_points = grant_row.reserved_points + v_grant_take
    WHERE grant_row.id = v_grant.id;

    INSERT INTO public.ai_point_operation_grants (
      account_id,
      operation_id,
      grant_id,
      allocation_order,
      reserved_points
    )
    VALUES (
      p_account_id,
      v_operation_id,
      v_grant.id,
      v_allocation_order,
      v_grant_take
    );

    v_remaining := v_remaining - v_grant_take;
  END LOOP;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'AI_ADDITIONAL_ALLOCATION_INCONSISTENT'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    SELECT v_operation_id, 'reserved'::TEXT, v_points;
END;
$$;

-- ------------------------------------------------------------
-- Finalize after a successful provider response.
--
-- Fixed actions charge the reserved fixed cost. Audio actions charge
-- real duration, capped by the reservation made before the call.
-- Unused reserved points return to their original monthly bucket or
-- additional grant.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_ai_points(
  p_operation_id UUID,
  p_actual_duration_ms BIGINT DEFAULT NULL,
  p_provider_request_id TEXT DEFAULT NULL,
  p_technical_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_account_id UUID;
  v_operation public.ai_point_operations%ROWTYPE;
  v_allocation RECORD;
  v_actual_points BIGINT;
  v_included_charge BIGINT;
  v_additional_charge BIGINT;
  v_additional_remaining BIGINT;
  v_grant_charge BIGINT;
BEGIN
  IF p_technical_metadata IS NULL
     OR jsonb_typeof(p_technical_metadata) <> 'object' THEN
    RAISE EXCEPTION 'AI_METADATA_MUST_BE_OBJECT' USING ERRCODE = '22023';
  END IF;

  SELECT operation.account_id
  INTO v_account_id
  FROM public.ai_point_operations operation
  WHERE operation.id = p_operation_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'AI_OPERATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_account_id::TEXT, 49));

  SELECT operation.*
  INTO v_operation
  FROM public.ai_point_operations operation
  WHERE operation.id = p_operation_id
  FOR UPDATE;

  IF v_operation.status = 'completed' THEN
    RETURN v_operation.charged_points;
  END IF;

  IF v_operation.status = 'released' THEN
    RAISE EXCEPTION 'AI_RESERVATION_ALREADY_RELEASED' USING ERRCODE = 'P0001';
  END IF;

  IF v_operation.billing_unit_snapshot = 'per_minute'
     AND (
       p_actual_duration_ms IS NULL
       OR p_actual_duration_ms <= 0
       OR p_actual_duration_ms > v_operation.estimated_duration_ms
     ) THEN
    RAISE EXCEPTION 'AI_ACTUAL_DURATION_OUT_OF_RANGE' USING ERRCODE = '22023';
  END IF;

  v_actual_points := public.calculate_ai_points(
    v_operation.billing_unit_snapshot,
    v_operation.points_per_unit_snapshot,
    p_actual_duration_ms
  );

  IF v_actual_points > v_operation.estimated_points THEN
    RAISE EXCEPTION 'AI_FINAL_POINTS_EXCEED_RESERVATION'
      USING ERRCODE = 'P0001';
  END IF;

  v_included_charge := LEAST(
    v_actual_points,
    v_operation.included_points_reserved
  );
  v_additional_charge := v_actual_points - v_included_charge;

  UPDATE public.ai_point_cycles cycle
  SET included_points_reserved =
        cycle.included_points_reserved - v_operation.included_points_reserved,
      included_points_used =
        cycle.included_points_used + v_included_charge
  WHERE cycle.id = v_operation.cycle_id
    AND cycle.account_id = v_operation.account_id
    AND cycle.included_points_reserved >= v_operation.included_points_reserved;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_MONTHLY_RESERVATION_INCONSISTENT'
      USING ERRCODE = 'P0001';
  END IF;

  v_additional_remaining := v_additional_charge;

  FOR v_allocation IN
    SELECT allocation.*
    FROM public.ai_point_operation_grants allocation
    WHERE allocation.operation_id = v_operation.id
    ORDER BY allocation.allocation_order
    FOR UPDATE
  LOOP
    v_grant_charge := LEAST(
      v_additional_remaining,
      v_allocation.reserved_points
    );

    UPDATE public.ai_point_grants grant_row
    SET reserved_points =
          grant_row.reserved_points - v_allocation.reserved_points,
        used_points =
          grant_row.used_points + v_grant_charge
    WHERE grant_row.id = v_allocation.grant_id
      AND grant_row.account_id = v_operation.account_id
      AND grant_row.reserved_points >= v_allocation.reserved_points;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'AI_ADDITIONAL_RESERVATION_INCONSISTENT'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.ai_point_operation_grants
    SET charged_points = v_grant_charge
    WHERE operation_id = v_operation.id
      AND grant_id = v_allocation.grant_id;

    v_additional_remaining :=
      v_additional_remaining - v_grant_charge;
  END LOOP;

  IF v_additional_remaining <> 0 THEN
    RAISE EXCEPTION 'AI_ADDITIONAL_FINALIZATION_INCONSISTENT'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.ai_point_operations
  SET status = 'completed',
      charged_points = v_actual_points,
      included_points_charged = v_included_charge,
      additional_points_charged = v_additional_charge,
      actual_duration_ms = CASE
        WHEN billing_unit_snapshot = 'per_minute'
          THEN p_actual_duration_ms
        ELSE NULL
      END,
      provider_request_id = NULLIF(trim(p_provider_request_id), ''),
      technical_metadata =
        technical_metadata || p_technical_metadata,
      completed_at = NOW()
  WHERE id = v_operation.id;

  RETURN v_actual_points;
END;
$$;

-- ------------------------------------------------------------
-- Function ownership and API permissions.
-- All balance mutations are server-only. Dashboard and platform UIs
-- must use authenticated server routes that scope every read.
-- ------------------------------------------------------------

ALTER FUNCTION public.calculate_ai_points(TEXT, BIGINT, BIGINT)
  OWNER TO postgres;
ALTER FUNCTION public.release_ai_points(UUID, TEXT)
  OWNER TO postgres;
ALTER FUNCTION public.reserve_ai_points(
  UUID, TEXT, TEXT, UUID, BIGINT, UUID, UUID, UUID, UUID, UUID, UUID, JSONB
) OWNER TO postgres;
ALTER FUNCTION public.finalize_ai_points(UUID, BIGINT, TEXT, JSONB)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.calculate_ai_points(TEXT, BIGINT, BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_ai_points(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reserve_ai_points(
  UUID, TEXT, TEXT, UUID, BIGINT, UUID, UUID, UUID, UUID, UUID, UUID, JSONB
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_ai_points(UUID, BIGINT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.calculate_ai_points(TEXT, BIGINT, BIGINT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_points(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_points(
  UUID, TEXT, TEXT, UUID, BIGINT, UUID, UUID, UUID, UUID, UUID, UUID, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_ai_points(UUID, BIGINT, TEXT, JSONB)
  TO service_role;

NOTIFY pgrst, 'reload schema';
