-- ============================================================
-- Ticketing, departments, supervisor role and department-aware RLS
--
-- Safe migration properties:
--   * keeps `conversations` as the ticket aggregate;
--   * preserves every existing conversation and message;
--   * seeds requested departments as account configuration;
--   * backfills existing conversations into Ventas;
--   * keeps one WhatsApp configuration per account;
--   * centralises ticket audit in a trigger so webhook, RPC and
--     automation changes all produce history.
-- ============================================================

-- ------------------------------------------------------------
-- Role hierarchy: owner > admin > supervisor > agent > viewer.
-- The helper below compares enum values through text so the new enum
-- value is not referenced as an enum literal in the same transaction.
-- ------------------------------------------------------------
ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'supervisor' BEFORE 'agent';

CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role::text
            WHEN 'owner'      THEN 5
            WHEN 'admin'      THEN 4
            WHEN 'supervisor' THEN 3
            WHEN 'agent'      THEN 2
            WHEN 'viewer'     THEN 1
          END
        >=
          CASE min_role::text
            WHEN 'owner'      THEN 5
            WHEN 'admin'      THEN 4
            WHEN 'supervisor' THEN 3
            WHEN 'agent'      THEN 2
            WHEN 'viewer'     THEN 1
          END
  );
$$;

ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- Departments and memberships.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  color TEXT NOT NULL DEFAULT '#64748b',
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, slug),
  UNIQUE (id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_departments_account_active_position
  ON departments(account_id, is_active, position);

DROP TRIGGER IF EXISTS set_updated_at ON departments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS department_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member'
    CHECK (member_role IN ('member', 'supervisor')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, user_id),
  FOREIGN KEY (department_id, account_id)
    REFERENCES departments(id, account_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_account_unique
  ON profiles(user_id, account_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'department_members_user_account_fkey'
      AND conrelid = 'department_members'::regclass
  ) THEN
    ALTER TABLE department_members
      ADD CONSTRAINT department_members_user_account_fkey
      FOREIGN KEY (user_id, account_id)
      REFERENCES profiles(user_id, account_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_department_members_account_user_active
  ON department_members(account_id, user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_department_members_department_active
  ON department_members(department_id, is_active);

INSERT INTO departments (account_id, name, slug, color, position, created_by_user_id)
SELECT
  a.id,
  seed.name,
  seed.slug,
  seed.color,
  seed.position,
  a.owner_user_id
FROM accounts a
CROSS JOIN (
  VALUES
    ('Ventas',         'ventas',         '#10b981', 10),
    ('Financiamiento', 'financiamiento', '#3b82f6', 20),
    ('Postventa',      'postventa',      '#8b5cf6', 30),
    ('Administración', 'administracion', '#f59e0b', 40),
    ('Soporte',        'soporte',        '#ef4444', 50)
) AS seed(name, slug, color, position)
ON CONFLICT (account_id, slug) DO NOTHING;

CREATE OR REPLACE FUNCTION seed_account_departments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO departments (
    account_id, name, slug, color, position, created_by_user_id
  ) VALUES
    (NEW.id, 'Ventas',         'ventas',         '#10b981', 10, NEW.owner_user_id),
    (NEW.id, 'Financiamiento', 'financiamiento', '#3b82f6', 20, NEW.owner_user_id),
    (NEW.id, 'Postventa',      'postventa',      '#8b5cf6', 30, NEW.owner_user_id),
    (NEW.id, 'Administración', 'administracion', '#f59e0b', 40, NEW.owner_user_id),
    (NEW.id, 'Soporte',        'soporte',        '#ef4444', 50, NEW.owner_user_id)
  ON CONFLICT (account_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION seed_account_departments() OWNER TO postgres;
DROP TRIGGER IF EXISTS on_account_seed_departments ON accounts;
CREATE TRIGGER on_account_seed_departments
  AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION seed_account_departments();

-- Existing executives retain access through the default department.
INSERT INTO department_members (account_id, department_id, user_id, member_role)
SELECT p.account_id, d.id, p.user_id, 'member'
FROM profiles p
JOIN departments d
  ON d.account_id = p.account_id AND d.slug = 'ventas'
WHERE p.account_role::text = 'agent'
ON CONFLICT (department_id, user_id) DO NOTHING;

-- ------------------------------------------------------------
-- Ticket metadata on the existing conversations table.
-- ------------------------------------------------------------
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID REFERENCES whatsapp_config(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('pending', 'open', 'waiting', 'closed'));
ALTER TABLE conversations ALTER COLUMN status SET DEFAULT 'pending';

UPDATE conversations c
SET department_id = d.id
FROM departments d
WHERE c.department_id IS NULL
  AND d.account_id = c.account_id
  AND d.slug = 'ventas';

UPDATE conversations c
SET whatsapp_config_id = wc.id
FROM whatsapp_config wc
WHERE c.whatsapp_config_id IS NULL
  AND wc.account_id = c.account_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM conversations
    WHERE whatsapp_config_id IS NOT NULL
    GROUP BY account_id, contact_id, whatsapp_config_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce continuous tickets: duplicate conversations exist for the same account, contact and WhatsApp number. Resolve them manually without deleting message history, then re-run migration 031.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact_whatsapp_unique
  ON conversations(account_id, contact_id, whatsapp_config_id)
  WHERE whatsapp_config_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_config_id_account_unique
  ON whatsapp_config(id, account_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_department_account_fkey'
      AND conrelid = 'conversations'::regclass
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_department_account_fkey
      FOREIGN KEY (department_id, account_id)
      REFERENCES departments(id, account_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_whatsapp_account_fkey'
      AND conrelid = 'conversations'::regclass
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_whatsapp_account_fkey
      FOREIGN KEY (whatsapp_config_id, account_id)
      REFERENCES whatsapp_config(id, account_id) ON DELETE RESTRICT;
  END IF;
END $$;

UPDATE conversations
SET status_changed_at = COALESCE(updated_at, created_at, NOW())
WHERE status_changed_at IS NULL;

-- Remove impossible legacy assignments before adding the formal FK.
UPDATE conversations c
SET assigned_agent_id = NULL
WHERE assigned_agent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = c.assigned_agent_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_assigned_agent_id_fkey'
      AND conrelid = 'conversations'::regclass
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_assigned_agent_id_fkey
      FOREIGN KEY (assigned_agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_account_status_activity
  ON conversations(account_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_account_department_status_activity
  ON conversations(account_id, department_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_account_agent_status_activity
  ON conversations(account_id, assigned_agent_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_account_whatsapp_status_activity
  ON conversations(account_id, whatsapp_config_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_account_unread
  ON conversations(account_id, last_message_at DESC)
  WHERE unread_count > 0;

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS display_phone TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS default_department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

UPDATE whatsapp_config wc
SET default_department_id = d.id
FROM departments d
WHERE wc.default_department_id IS NULL
  AND d.account_id = wc.account_id
  AND d.slug = 'ventas';

CREATE OR REPLACE FUNCTION set_whatsapp_default_department()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.default_department_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM departments d
    WHERE d.id = NEW.default_department_id
      AND d.account_id = NEW.account_id
      AND d.is_active
  ) THEN
    SELECT d.id INTO NEW.default_department_id
    FROM departments d
    WHERE d.account_id = NEW.account_id
      AND d.is_active
    ORDER BY (d.slug = 'ventas') DESC, d.position, d.created_at
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION set_whatsapp_default_department() OWNER TO postgres;
DROP TRIGGER IF EXISTS on_whatsapp_default_department ON whatsapp_config;
CREATE TRIGGER on_whatsapp_default_department
  BEFORE INSERT OR UPDATE OF account_id, default_department_id
  ON whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION set_whatsapp_default_department();

CREATE OR REPLACE FUNCTION reassign_archived_department_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active THEN
    UPDATE whatsapp_config
    SET default_department_id = NULL
    WHERE account_id = NEW.account_id
      AND default_department_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION reassign_archived_department_defaults() OWNER TO postgres;
DROP TRIGGER IF EXISTS on_department_reassign_defaults ON departments;
CREATE TRIGGER on_department_reassign_defaults
  AFTER UPDATE OF is_active ON departments
  FOR EACH ROW EXECUTE FUNCTION reassign_archived_department_defaults();

-- Revalidate defaults that may already point at an inactive department.
UPDATE whatsapp_config
SET default_department_id = default_department_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_config_default_department_account_fkey'
      AND conrelid = 'whatsapp_config'::regclass
  ) THEN
    ALTER TABLE whatsapp_config
      ADD CONSTRAINT whatsapp_config_default_department_account_fkey
      FOREIGN KEY (default_department_id, account_id)
      REFERENCES departments(id, account_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Commercial contact fields. All optional and non-destructive.
-- ------------------------------------------------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS rut TEXT,
  ADD COLUMN IF NOT EXISTS rut_normalized TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS interest_product TEXT,
  ADD COLUMN IF NOT EXISTS budget NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS down_payment NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS financing_type TEXT,
  ADD COLUMN IF NOT EXISTS evaluation_status TEXT,
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_rut_normalized
  ON contacts(account_id, rut_normalized)
  WHERE rut_normalized IS NOT NULL AND rut_normalized <> '';
CREATE INDEX IF NOT EXISTS idx_contacts_account_follow_up
  ON contacts(account_id, next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;

-- ------------------------------------------------------------
-- Ticket audit, internal notes and quick replies.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'accepted', 'assigned', 'unassigned', 'transferred',
    'department_changed', 'status_changed', 'waiting', 'closed', 'reopened'
  )),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT,
  from_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  to_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_conversation_created
  ON ticket_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_events_account_type_created
  ON ticket_events(account_id, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_notes_conversation_created
  ON ticket_notes(conversation_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON ticket_notes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ticket_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
  shortcut TEXT CHECK (shortcut IS NULL OR shortcut ~ '^/[a-z0-9_-]{1,30}$'),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (department_id, account_id)
    REFERENCES departments(id, account_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_account_department_active
  ON quick_replies(account_id, department_id, is_active, title);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_replies_account_department_shortcut
  ON quick_replies(account_id, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid), shortcut)
  WHERE shortcut IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON quick_replies;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON quick_replies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Baseline audit rows for conversations that existed before this migration.
INSERT INTO ticket_events (
  account_id, conversation_id, event_type, to_status,
  to_agent_id, to_department_id, metadata, created_at
)
SELECT
  c.account_id, c.id, 'created', c.status,
  c.assigned_agent_id, c.department_id,
  '{"source":"migration_backfill"}'::jsonb,
  c.created_at
FROM conversations c
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_events e
  WHERE e.conversation_id = c.id AND e.event_type = 'created'
);

-- ------------------------------------------------------------
-- Department-aware authorization helpers.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_account_role(target_account_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.account_role::text
  FROM profiles p
  WHERE p.user_id = auth.uid() AND p.account_id = target_account_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_department_member(target_department_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM department_members dm
    WHERE dm.department_id = target_department_id
      AND dm.user_id = auth.uid()
      AND dm.is_active
  );
$$;

CREATE OR REPLACE FUNCTION is_department_supervisor(target_department_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM department_members dm
    WHERE dm.department_id = target_department_id
      AND dm.user_id = auth.uid()
      AND dm.member_role = 'supervisor'
      AND dm.is_active
  );
$$;

CREATE OR REPLACE FUNCTION can_view_ticket(target_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversations c
    JOIN profiles p
      ON p.user_id = auth.uid() AND p.account_id = c.account_id
    WHERE c.id = target_conversation_id
      AND (
        p.account_role::text IN ('owner', 'admin', 'viewer')
        OR (
          p.account_role::text = 'supervisor'
          AND c.department_id IS NOT NULL
          AND is_department_supervisor(c.department_id)
        )
        OR (
          p.account_role::text = 'agent'
          AND (
            c.assigned_agent_id = auth.uid()
            OR (
              c.status = 'pending'
              AND c.assigned_agent_id IS NULL
              AND c.department_id IS NOT NULL
              AND is_department_member(c.department_id)
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION can_operate_ticket(target_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversations c
    JOIN profiles p
      ON p.user_id = auth.uid() AND p.account_id = c.account_id
    WHERE c.id = target_conversation_id
      AND (
        p.account_role::text IN ('owner', 'admin')
        OR (
          p.account_role::text = 'supervisor'
          AND c.department_id IS NOT NULL
          AND is_department_supervisor(c.department_id)
        )
        OR (
          p.account_role::text = 'agent'
          AND (
            c.assigned_agent_id = auth.uid()
            OR (
              c.status = 'pending'
              AND c.assigned_agent_id IS NULL
              AND c.department_id IS NOT NULL
              AND is_department_member(c.department_id)
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION can_create_ticket(
  target_account_id UUID,
  target_department_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE current_account_role(target_account_id)
    WHEN 'owner' THEN TRUE
    WHEN 'admin' THEN TRUE
    WHEN 'supervisor' THEN is_department_supervisor(target_department_id)
    WHEN 'agent' THEN is_department_member(target_department_id)
    ELSE FALSE
  END;
$$;

ALTER FUNCTION current_account_role(UUID) OWNER TO postgres;
ALTER FUNCTION is_department_member(UUID) OWNER TO postgres;
ALTER FUNCTION is_department_supervisor(UUID) OWNER TO postgres;
ALTER FUNCTION can_view_ticket(UUID) OWNER TO postgres;
ALTER FUNCTION can_operate_ticket(UUID) OWNER TO postgres;
ALTER FUNCTION can_create_ticket(UUID, UUID) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION current_account_role(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_department_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_department_supervisor(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION can_view_ticket(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION can_operate_ticket(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION can_create_ticket(UUID, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Central ticket audit trigger. RPCs can attach an optional note by
-- setting the transaction-local `app.ticket_event_note` setting.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_ticket_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note TEXT := NULLIF(current_setting('app.ticket_event_note', TRUE), '');
  v_event_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO ticket_events (
      account_id, conversation_id, event_type, actor_user_id,
      to_status, to_agent_id, to_department_id, note
    ) VALUES (
      NEW.account_id, NEW.id, 'created', auth.uid(),
      NEW.status, NEW.assigned_agent_id, NEW.department_id, v_note
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event_type := CASE
      WHEN OLD.status = 'pending' AND NEW.status = 'open' THEN 'accepted'
      WHEN NEW.status = 'waiting' THEN 'waiting'
      WHEN NEW.status = 'closed' THEN 'closed'
      WHEN OLD.status = 'closed' THEN 'reopened'
      ELSE 'status_changed'
    END;
    INSERT INTO ticket_events (
      account_id, conversation_id, event_type, actor_user_id,
      from_status, to_status, note
    ) VALUES (
      NEW.account_id, NEW.id, v_event_type, auth.uid(),
      OLD.status, NEW.status, v_note
    );
  END IF;

  IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    v_event_type := CASE
      WHEN OLD.assigned_agent_id IS NULL THEN 'assigned'
      WHEN NEW.assigned_agent_id IS NULL THEN 'unassigned'
      ELSE 'transferred'
    END;
    INSERT INTO ticket_events (
      account_id, conversation_id, event_type, actor_user_id,
      from_agent_id, to_agent_id, note
    ) VALUES (
      NEW.account_id, NEW.id, v_event_type, auth.uid(),
      OLD.assigned_agent_id, NEW.assigned_agent_id, v_note
    );
  END IF;

  IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    INSERT INTO ticket_events (
      account_id, conversation_id, event_type, actor_user_id,
      from_department_id, to_department_id, note
    ) VALUES (
      NEW.account_id, NEW.id, 'department_changed', auth.uid(),
      OLD.department_id, NEW.department_id, v_note
    );
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION audit_ticket_change() OWNER TO postgres;
DROP TRIGGER IF EXISTS on_ticket_audit ON conversations;
CREATE TRIGGER on_ticket_audit
  AFTER INSERT OR UPDATE OF status, assigned_agent_id, department_id
  ON conversations
  FOR EACH ROW EXECUTE FUNCTION audit_ticket_change();

-- Authenticated clients must use the transactional RPCs for workflow fields.
-- Service-role integrations (webhook/automations) remain able to update them.
CREATE OR REPLACE FUNCTION enforce_ticket_workflow_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated'
     AND NULLIF(current_setting('app.ticket_workflow_authorized', TRUE), '') IS DISTINCT FROM 'true'
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
       OR NEW.department_id IS DISTINCT FROM OLD.department_id
       OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR NEW.accepted_by_user_id IS DISTINCT FROM OLD.accepted_by_user_id
       OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
       OR NEW.closed_by_user_id IS DISTINCT FROM OLD.closed_by_user_id
       OR NEW.waiting_since IS DISTINCT FROM OLD.waiting_since
     ) THEN
    RAISE EXCEPTION 'ticket_workflow_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION enforce_ticket_workflow_write() OWNER TO postgres;
DROP TRIGGER IF EXISTS enforce_ticket_workflow_write ON conversations;
CREATE TRIGGER enforce_ticket_workflow_write
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION enforce_ticket_workflow_write();

-- ------------------------------------------------------------
-- Transactional workflow RPCs.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_ticket(p_conversation_id UUID)
RETURNS SETOF conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_ticket FROM conversations
  WHERE id = p_conversation_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT can_operate_ticket(v_ticket.id) THEN
    RAISE EXCEPTION 'ticket_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_ticket.status <> 'pending' THEN
    RAISE EXCEPTION 'ticket_not_pending' USING ERRCODE = 'P0001';
  END IF;
  IF v_ticket.assigned_agent_id IS NOT NULL
     AND v_ticket.assigned_agent_id <> auth.uid() THEN
    RAISE EXCEPTION 'ticket_already_assigned' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.ticket_workflow_authorized', 'true', TRUE);
  UPDATE conversations SET
    assigned_agent_id = auth.uid(),
    status = 'open',
    accepted_at = NOW(),
    accepted_by_user_id = auth.uid(),
    status_changed_at = NOW(),
    waiting_since = NULL,
    updated_at = NOW()
  WHERE id = p_conversation_id;

  RETURN QUERY SELECT * FROM conversations WHERE id = p_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION transfer_ticket(
  p_conversation_id UUID,
  p_assigned_agent_id UUID,
  p_department_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS SETOF conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket conversations%ROWTYPE;
  v_target_department UUID;
  v_actor_role TEXT;
  v_target_role TEXT;
BEGIN
  SELECT * INTO v_ticket FROM conversations
  WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT can_operate_ticket(v_ticket.id) THEN
    RAISE EXCEPTION 'ticket_forbidden' USING ERRCODE = '42501';
  END IF;

  v_target_department := COALESCE(p_department_id, v_ticket.department_id);
  v_actor_role := current_account_role(v_ticket.account_id);

  IF v_actor_role = 'agent'
     AND v_ticket.assigned_agent_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only_owner_can_transfer' USING ERRCODE = '42501';
  END IF;

  IF p_assigned_agent_id IS NOT NULL THEN
    SELECT p.account_role::text INTO v_target_role
    FROM profiles p
    WHERE p.user_id = p_assigned_agent_id
      AND p.account_id = v_ticket.account_id;
    IF v_target_role IS NULL OR v_target_role = 'viewer' THEN
      RAISE EXCEPTION 'invalid_target_agent' USING ERRCODE = 'P0001';
    END IF;
    IF v_target_role IN ('agent', 'supervisor')
       AND NOT EXISTS (
         SELECT 1 FROM department_members dm
         WHERE dm.department_id = v_target_department
           AND dm.user_id = p_assigned_agent_id
           AND dm.is_active
       ) THEN
      RAISE EXCEPTION 'target_not_in_department' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM set_config('app.ticket_event_note', COALESCE(trim(p_note), ''), TRUE);
  PERFORM set_config('app.ticket_workflow_authorized', 'true', TRUE);
  UPDATE conversations SET
    department_id = v_target_department,
    assigned_agent_id = p_assigned_agent_id,
    status = CASE WHEN p_assigned_agent_id IS NULL THEN 'pending' ELSE 'open' END,
    accepted_at = CASE WHEN p_assigned_agent_id IS NULL THEN NULL ELSE COALESCE(accepted_at, NOW()) END,
    accepted_by_user_id = CASE WHEN p_assigned_agent_id IS NULL THEN NULL ELSE COALESCE(accepted_by_user_id, auth.uid()) END,
    status_changed_at = NOW(),
    waiting_since = NULL,
    closed_at = NULL,
    closed_by_user_id = NULL,
    updated_at = NOW()
  WHERE id = p_conversation_id;

  RETURN QUERY SELECT * FROM conversations WHERE id = p_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION set_ticket_status(
  p_conversation_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL
) RETURNS SETOF conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket conversations%ROWTYPE;
  v_next_status TEXT;
BEGIN
  IF p_status NOT IN ('pending', 'open', 'waiting', 'closed') THEN
    RAISE EXCEPTION 'invalid_ticket_status' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_ticket FROM conversations
  WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT can_operate_ticket(v_ticket.id) THEN
    RAISE EXCEPTION 'ticket_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_status = 'open' AND v_ticket.status = 'pending'
     AND v_ticket.assigned_agent_id IS NULL THEN
    RAISE EXCEPTION 'accept_ticket_first' USING ERRCODE = 'P0001';
  END IF;

  v_next_status := p_status;
  IF v_ticket.status = 'closed' AND p_status = 'open'
     AND v_ticket.assigned_agent_id IS NULL THEN
    v_next_status := 'pending';
  END IF;

  PERFORM set_config('app.ticket_event_note', COALESCE(trim(p_note), ''), TRUE);
  PERFORM set_config('app.ticket_workflow_authorized', 'true', TRUE);
  UPDATE conversations SET
    status = v_next_status,
    assigned_agent_id = CASE
      WHEN v_next_status = 'pending' THEN NULL
      ELSE assigned_agent_id
    END,
    accepted_at = CASE
      WHEN v_next_status = 'pending' THEN NULL
      ELSE accepted_at
    END,
    accepted_by_user_id = CASE
      WHEN v_next_status = 'pending' THEN NULL
      ELSE accepted_by_user_id
    END,
    status_changed_at = NOW(),
    waiting_since = CASE WHEN v_next_status = 'waiting' THEN NOW() ELSE NULL END,
    closed_at = CASE WHEN v_next_status = 'closed' THEN NOW() ELSE NULL END,
    closed_by_user_id = CASE WHEN v_next_status = 'closed' THEN auth.uid() ELSE NULL END,
    updated_at = NOW()
  WHERE id = p_conversation_id;

  RETURN QUERY SELECT * FROM conversations WHERE id = p_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION set_ticket_department(
  p_conversation_id UUID,
  p_department_id UUID,
  p_note TEXT DEFAULT NULL
) RETURNS SETOF conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket conversations%ROWTYPE;
  v_role TEXT;
  v_keep_assignee BOOLEAN;
BEGIN
  SELECT * INTO v_ticket FROM conversations
  WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT can_operate_ticket(v_ticket.id) THEN
    RAISE EXCEPTION 'ticket_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM departments d
    WHERE d.id = p_department_id
      AND d.account_id = v_ticket.account_id
      AND d.is_active
  ) THEN
    RAISE EXCEPTION 'invalid_department' USING ERRCODE = 'P0001';
  END IF;

  v_role := current_account_role(v_ticket.account_id);
  IF v_role = 'supervisor' AND NOT is_department_supervisor(p_department_id) THEN
    RAISE EXCEPTION 'department_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'agent' AND NOT is_department_member(p_department_id) THEN
    RAISE EXCEPTION 'department_forbidden' USING ERRCODE = '42501';
  END IF;

  v_keep_assignee :=
    v_ticket.assigned_agent_id IS NULL
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = v_ticket.assigned_agent_id
        AND p.account_id = v_ticket.account_id
        AND p.account_role::text IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM department_members dm
      WHERE dm.department_id = p_department_id
        AND dm.user_id = v_ticket.assigned_agent_id
        AND dm.is_active
    );

  PERFORM set_config('app.ticket_event_note', COALESCE(trim(p_note), ''), TRUE);
  PERFORM set_config('app.ticket_workflow_authorized', 'true', TRUE);
  UPDATE conversations SET
    department_id = p_department_id,
    assigned_agent_id = CASE WHEN v_keep_assignee THEN v_ticket.assigned_agent_id ELSE NULL END,
    status = CASE WHEN v_keep_assignee THEN v_ticket.status ELSE 'pending' END,
    accepted_at = CASE WHEN v_keep_assignee THEN v_ticket.accepted_at ELSE NULL END,
    accepted_by_user_id = CASE WHEN v_keep_assignee THEN v_ticket.accepted_by_user_id ELSE NULL END,
    waiting_since = CASE WHEN v_keep_assignee THEN v_ticket.waiting_since ELSE NULL END,
    closed_at = CASE WHEN v_keep_assignee THEN v_ticket.closed_at ELSE NULL END,
    closed_by_user_id = CASE WHEN v_keep_assignee THEN v_ticket.closed_by_user_id ELSE NULL END,
    status_changed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_conversation_id;

  RETURN QUERY SELECT * FROM conversations WHERE id = p_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION mark_ticket_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_view_ticket(p_conversation_id) THEN
    RAISE EXCEPTION 'ticket_forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE conversations SET unread_count = 0, updated_at = NOW()
  WHERE id = p_conversation_id;
END;
$$;

ALTER FUNCTION accept_ticket(UUID) OWNER TO postgres;
ALTER FUNCTION transfer_ticket(UUID, UUID, UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION set_ticket_status(UUID, TEXT, TEXT) OWNER TO postgres;
ALTER FUNCTION set_ticket_department(UUID, UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION mark_ticket_read(UUID) OWNER TO postgres;

REVOKE ALL ON FUNCTION accept_ticket(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION transfer_ticket(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_ticket_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_ticket_department(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_ticket_read(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION accept_ticket(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_ticket(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION set_ticket_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION set_ticket_department(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_ticket_read(UUID) TO authenticated;

-- ------------------------------------------------------------
-- RLS policies.
-- ------------------------------------------------------------
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_select ON departments;
DROP POLICY IF EXISTS departments_insert ON departments;
DROP POLICY IF EXISTS departments_update ON departments;
DROP POLICY IF EXISTS departments_delete ON departments;
CREATE POLICY departments_select ON departments FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY departments_insert ON departments FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY departments_update ON departments FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY departments_delete ON departments FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS department_members_select ON department_members;
DROP POLICY IF EXISTS department_members_insert ON department_members;
DROP POLICY IF EXISTS department_members_update ON department_members;
DROP POLICY IF EXISTS department_members_delete ON department_members;
CREATE POLICY department_members_select ON department_members FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY department_members_insert ON department_members FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY department_members_update ON department_members FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY department_members_delete ON department_members FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS conversations_select ON conversations;
DROP POLICY IF EXISTS conversations_insert ON conversations;
DROP POLICY IF EXISTS conversations_update ON conversations;
DROP POLICY IF EXISTS conversations_delete ON conversations;
CREATE POLICY conversations_select ON conversations FOR SELECT
  USING (can_view_ticket(id));
CREATE POLICY conversations_insert ON conversations FOR INSERT
  WITH CHECK (can_create_ticket(account_id, department_id));
CREATE POLICY conversations_update ON conversations FOR UPDATE
  USING (can_operate_ticket(id))
  WITH CHECK (can_view_ticket(id));
CREATE POLICY conversations_delete ON conversations FOR DELETE
  USING (current_account_role(account_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS messages_select ON messages;
DROP POLICY IF EXISTS messages_modify ON messages;
CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id AND can_view_ticket(c.id)
  )
);
CREATE POLICY messages_modify ON messages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id AND can_operate_ticket(c.id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id AND can_operate_ticket(c.id)
  )
);

DROP POLICY IF EXISTS ticket_events_select ON ticket_events;
CREATE POLICY ticket_events_select ON ticket_events FOR SELECT
  USING (can_view_ticket(conversation_id));
-- Audit rows are trigger/service-role only. No client mutation policy.

DROP POLICY IF EXISTS ticket_notes_select ON ticket_notes;
DROP POLICY IF EXISTS ticket_notes_insert ON ticket_notes;
DROP POLICY IF EXISTS ticket_notes_update ON ticket_notes;
DROP POLICY IF EXISTS ticket_notes_delete ON ticket_notes;
CREATE POLICY ticket_notes_select ON ticket_notes FOR SELECT
  USING (can_view_ticket(conversation_id));
CREATE POLICY ticket_notes_insert ON ticket_notes FOR INSERT
  WITH CHECK (
    author_user_id = auth.uid()
    AND can_operate_ticket(conversation_id)
  );
CREATE POLICY ticket_notes_update ON ticket_notes FOR UPDATE
  USING (
    author_user_id = auth.uid()
    AND can_operate_ticket(conversation_id)
  ) WITH CHECK (
    author_user_id = auth.uid()
    AND can_operate_ticket(conversation_id)
  );
CREATE POLICY ticket_notes_delete ON ticket_notes FOR DELETE
  USING (
    (author_user_id = auth.uid() AND can_operate_ticket(conversation_id))
    OR current_account_role(account_id) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS quick_replies_select ON quick_replies;
DROP POLICY IF EXISTS quick_replies_insert ON quick_replies;
DROP POLICY IF EXISTS quick_replies_update ON quick_replies;
DROP POLICY IF EXISTS quick_replies_delete ON quick_replies;
CREATE POLICY quick_replies_select ON quick_replies FOR SELECT
  USING (
    is_account_member(account_id)
    AND (
      department_id IS NULL
      OR current_account_role(account_id) IN ('owner', 'admin')
      OR is_department_member(department_id)
      OR is_department_supervisor(department_id)
    )
  );
CREATE POLICY quick_replies_insert ON quick_replies FOR INSERT
  WITH CHECK (
    current_account_role(account_id) IN ('owner', 'admin')
    OR (
      current_account_role(account_id) = 'supervisor'
      AND department_id IS NOT NULL
      AND is_department_supervisor(department_id)
    )
  );
CREATE POLICY quick_replies_update ON quick_replies FOR UPDATE
  USING (
    current_account_role(account_id) IN ('owner', 'admin')
    OR (
      current_account_role(account_id) = 'supervisor'
      AND department_id IS NOT NULL
      AND is_department_supervisor(department_id)
    )
  ) WITH CHECK (
    current_account_role(account_id) IN ('owner', 'admin')
    OR (
      current_account_role(account_id) = 'supervisor'
      AND department_id IS NOT NULL
      AND is_department_supervisor(department_id)
    )
  );
CREATE POLICY quick_replies_delete ON quick_replies FOR DELETE
  USING (
    current_account_role(account_id) IN ('owner', 'admin')
    OR (
      current_account_role(account_id) = 'supervisor'
      AND department_id IS NOT NULL
      AND is_department_supervisor(department_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON department_members TO authenticated;
GRANT SELECT ON ticket_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ticket_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON quick_replies TO authenticated;

-- Realtime keeps the inbox history and internal-note panels current.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ticket_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ticket_events;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ticket_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ticket_notes;
  END IF;
END $$;
