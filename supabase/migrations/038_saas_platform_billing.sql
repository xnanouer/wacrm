-- ============================================================
-- 038_saas_platform_billing.sql
-- SaaS control plane: platform staff, plans, subscription lifecycle,
-- audit trail, and tenant suspension enforcement.
--
-- Platform roles are intentionally separate from account_role_enum.
-- An account owner controls one company; a platform owner controls
-- Nexora itself. Tenant users never gain cross-account visibility.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_role_enum') THEN
    CREATE TYPE platform_role_enum AS ENUM (
      'platform_owner',
      'platform_admin',
      'platform_support'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'account_subscription_status_enum'
  ) THEN
    CREATE TYPE account_subscription_status_enum AS ENUM (
      'trialing',
      'active',
      'past_due',
      'suspended',
      'canceled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role platform_role_enum NOT NULL DEFAULT 'platform_support',
  granted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_admins_select_self ON platform_admins;
CREATE POLICY platform_admins_select_self ON platform_admins FOR SELECT
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at ON platform_admins;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform_admins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS saas_plans (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  description TEXT,
  monthly_price NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  max_users INTEGER CHECK (max_users IS NULL OR max_users > 0),
  max_channels INTEGER CHECK (max_channels IS NULL OR max_channels > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE saas_plans ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON saas_plans;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON saas_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO saas_plans (code, name, description, max_users, max_channels)
VALUES
  ('trial', 'Prueba', 'Periodo inicial para evaluar Nexora', 5, 1),
  ('starter', 'Inicial', 'Para equipos pequenos que comienzan', 5, 1),
  ('professional', 'Profesional', 'Para equipos con varios departamentos', 25, 3),
  ('enterprise', 'Empresa', 'Limites y condiciones personalizados', NULL, NULL)
ON CONFLICT (code) DO NOTHING;

-- Existing companies must remain usable after applying this migration.
-- New signups start on a 14-day trial through the defaults installed
-- after the backfill.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan_code TEXT REFERENCES saas_plans(code),
  ADD COLUMN IF NOT EXISTS subscription_status account_subscription_status_enum,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS billing_provider TEXT,
  ADD COLUMN IF NOT EXISTS billing_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_subscription_id TEXT;

UPDATE accounts
SET plan_code = COALESCE(plan_code, 'professional'),
    subscription_status = COALESCE(subscription_status, 'active');

ALTER TABLE accounts ALTER COLUMN plan_code SET DEFAULT 'trial';
ALTER TABLE accounts ALTER COLUMN plan_code SET NOT NULL;
ALTER TABLE accounts ALTER COLUMN subscription_status SET DEFAULT 'trialing';
ALTER TABLE accounts ALTER COLUMN subscription_status SET NOT NULL;
ALTER TABLE accounts ALTER COLUMN trial_ends_at SET DEFAULT (NOW() + INTERVAL '14 days');

CREATE INDEX IF NOT EXISTS idx_accounts_subscription_status
  ON accounts(subscription_status);
CREATE INDEX IF NOT EXISTS idx_accounts_plan_code ON accounts(plan_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_billing_customer
  ON accounts(billing_provider, billing_customer_id)
  WHERE billing_provider IS NOT NULL AND billing_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_billing_subscription
  ON accounts(billing_provider, billing_subscription_id)
  WHERE billing_provider IS NOT NULL AND billing_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(trim(action)) BETWEEN 3 AND 100),
  previous_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  next_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_account_created
  ON platform_audit_logs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_actor_created
  ON platform_audit_logs(actor_user_id, created_at DESC);

ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;

-- No client write policy exists for the audit table. Platform routes use
-- the server-only service client after independently checking platform role.
DROP POLICY IF EXISTS platform_audit_select_own_actions ON platform_audit_logs;
CREATE POLICY platform_audit_select_own_actions ON platform_audit_logs FOR SELECT
  USING (auth.uid() = actor_user_id);

CREATE OR REPLACE FUNCTION is_platform_admin(
  target_user_id UUID DEFAULT auth.uid(),
  min_role platform_role_enum DEFAULT 'platform_support'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform_admins pa
    WHERE pa.user_id = target_user_id
      AND CASE pa.role
            WHEN 'platform_owner' THEN 3
            WHEN 'platform_admin' THEN 2
            WHEN 'platform_support' THEN 1
          END
          >=
          CASE min_role
            WHEN 'platform_owner' THEN 3
            WHEN 'platform_admin' THEN 2
            WHEN 'platform_support' THEN 1
          END
  );
$$;

ALTER FUNCTION is_platform_admin(UUID, platform_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION is_platform_admin(UUID, platform_role_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin(UUID, platform_role_enum)
  TO authenticated, service_role;

-- Membership without a subscription check is needed so suspended users can
-- still read the account name and billing state on the recovery screen.
CREATE OR REPLACE FUNCTION is_account_profile_member(target_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() AND p.account_id = target_account_id
  );
$$;

ALTER FUNCTION is_account_profile_member(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION is_account_profile_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_account_profile_member(UUID)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION account_has_operational_access(target_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE a.subscription_status
      WHEN 'active' THEN TRUE
      WHEN 'trialing' THEN a.trial_ends_at IS NULL OR a.trial_ends_at > NOW()
      WHEN 'past_due' THEN a.grace_ends_at IS NOT NULL AND a.grace_ends_at > NOW()
      ELSE FALSE
    END
    FROM accounts a
    WHERE a.id = target_account_id
  ), FALSE);
$$;

ALTER FUNCTION account_has_operational_access(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION account_has_operational_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION account_has_operational_access(UUID)
  TO authenticated, service_role;

-- Replace the central tenant helper. Nearly every RLS policy calls this
-- function, so suspension becomes a database-level boundary instead of a
-- cosmetic UI redirect.
CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_has_operational_access(target_account_id)
    AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_id = target_account_id
        AND CASE p.account_role::text
              WHEN 'owner' THEN 5
              WHEN 'admin' THEN 4
              WHEN 'supervisor' THEN 3
              WHEN 'agent' THEN 2
              WHEN 'viewer' THEN 1
            END
            >=
            CASE min_role::text
              WHEN 'owner' THEN 5
              WHEN 'admin' THEN 4
              WHEN 'supervisor' THEN 3
              WHEN 'agent' THEN 2
              WHEN 'viewer' THEN 1
            END
    );
$$;

ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum)
  TO authenticated, service_role;

-- Suspended users can read only their own account shell; all tenant domain
-- tables remain protected by is_account_member() above.
DROP POLICY IF EXISTS accounts_select ON accounts;
CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (is_account_profile_member(id));

-- Prevent a company admin from editing billing-controlled fields through the
-- normal account update policy. The service-role platform route is the only
-- supported writer for these columns.
CREATE OR REPLACE FUNCTION prevent_tenant_billing_field_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (
    NEW.plan_code IS DISTINCT FROM OLD.plan_code OR
    NEW.subscription_status IS DISTINCT FROM OLD.subscription_status OR
    NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at OR
    NEW.grace_ends_at IS DISTINCT FROM OLD.grace_ends_at OR
    NEW.current_period_ends_at IS DISTINCT FROM OLD.current_period_ends_at OR
    NEW.suspended_at IS DISTINCT FROM OLD.suspended_at OR
    NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason OR
    NEW.billing_provider IS DISTINCT FROM OLD.billing_provider OR
    NEW.billing_customer_id IS DISTINCT FROM OLD.billing_customer_id OR
    NEW.billing_subscription_id IS DISTINCT FROM OLD.billing_subscription_id
  ) THEN
    RAISE EXCEPTION 'billing_fields_are_platform_managed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_account_billing_fields ON accounts;
CREATE TRIGGER protect_account_billing_fields
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION prevent_tenant_billing_field_changes();

-- One server-only aggregate keeps the platform dashboard fast as the number
-- of tenants grows and avoids downloading tenant records just to count them.
CREATE OR REPLACE FUNCTION platform_account_overview()
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  owner_name TEXT,
  owner_email TEXT,
  plan_code TEXT,
  plan_name TEXT,
  subscription_status account_subscription_status_enum,
  trial_ends_at TIMESTAMPTZ,
  grace_ends_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  suspension_reason TEXT,
  account_created_at TIMESTAMPTZ,
  users_count BIGINT,
  contacts_count BIGINT,
  conversations_count BIGINT,
  whatsapp_status TEXT,
  whatsapp_provider TEXT,
  social_channels_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.name,
    owner_profile.full_name,
    owner_profile.email,
    a.plan_code,
    COALESCE(sp.name, a.plan_code),
    a.subscription_status,
    a.trial_ends_at,
    a.grace_ends_at,
    a.current_period_ends_at,
    a.suspended_at,
    a.suspension_reason,
    a.created_at,
    COALESCE(member_totals.total, 0),
    COALESCE(contact_totals.total, 0),
    COALESCE(conversation_totals.total, 0),
    wc.status,
    wc.provider,
    COALESCE(social_totals.total, 0)
  FROM accounts a
  LEFT JOIN saas_plans sp ON sp.code = a.plan_code
  LEFT JOIN LATERAL (
    SELECT p.full_name, p.email
    FROM profiles p
    WHERE p.user_id = a.owner_user_id
    LIMIT 1
  ) owner_profile ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS total FROM profiles p WHERE p.account_id = a.id
  ) member_totals ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS total FROM contacts c WHERE c.account_id = a.id
  ) contact_totals ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS total FROM conversations c WHERE c.account_id = a.id
  ) conversation_totals ON TRUE
  LEFT JOIN whatsapp_config wc ON wc.account_id = a.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::BIGINT AS total
    FROM channel_connections cc
    WHERE cc.account_id = a.id AND cc.status = 'connected'
  ) social_totals ON TRUE
  ORDER BY a.created_at DESC;
$$;

ALTER FUNCTION platform_account_overview() OWNER TO postgres;
REVOKE ALL ON FUNCTION platform_account_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_account_overview() TO service_role;

NOTIFY pgrst, 'reload schema';
