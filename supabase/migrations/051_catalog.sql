-- ============================================================================
-- NEXORA CATALOG — APPROVED STRUCTURAL MIGRATION
-- ============================================================================
-- Approved after the catalog architecture audit and structural review.
--
-- IMPORTANT:
--   * Apply through Supabase CLI so migration history remains authoritative.
--   * It assumes migrations 027, 031, 034, 044, 045, 049 and 050 are applied.
--   * First release uses the existing administrator/agent product roles.
--   * Internal owner/admin/supervisor roles may review catalog items.
--   * Trial receives the Starter allowance: 50 active units.
-- ============================================================================

BEGIN;

SET search_path = public, pg_catalog;

-- ============================================================================
-- 1. AUTHORITATIVE PLAN CAPACITY
-- ============================================================================

ALTER TABLE public.saas_plans
  ADD COLUMN IF NOT EXISTS max_active_catalog_items INTEGER;

ALTER TABLE public.saas_plans
  DROP CONSTRAINT IF EXISTS saas_plans_max_active_catalog_items_check;
ALTER TABLE public.saas_plans
  ADD CONSTRAINT saas_plans_max_active_catalog_items_check
  CHECK (
    max_active_catalog_items IS NULL
    OR max_active_catalog_items >= 0
  );

UPDATE public.saas_plans
SET max_active_catalog_items = CASE code
  WHEN 'trial' THEN 50
  WHEN 'starter' THEN 50
  WHEN 'professional' THEN 150
  WHEN 'enterprise' THEN 500
  ELSE max_active_catalog_items
END,
updated_at = NOW()
WHERE code IN ('trial', 'starter', 'professional', 'enterprise');

CREATE TABLE IF NOT EXISTS public.account_catalog_entitlements (
  account_id             UUID PRIMARY KEY
                         REFERENCES public.accounts(id) ON DELETE CASCADE,
  extra_blocks           INTEGER NOT NULL DEFAULT 0
                         CHECK (extra_blocks >= 0),
  block_units_snapshot   INTEGER NOT NULL DEFAULT 10
                         CHECK (block_units_snapshot > 0),
  monthly_price_snapshot NUMERIC(12, 2) NOT NULL DEFAULT 5990
                         CHECK (monthly_price_snapshot >= 0),
  currency               TEXT NOT NULL DEFAULT 'CLP'
                         CHECK (currency ~ '^[A-Z]{3}$'),
  valid_from             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until            TIMESTAMPTZ,
  source                 TEXT NOT NULL DEFAULT 'manual'
                         CHECK (source IN (
                           'manual', 'billing', 'promotion', 'migration'
                         )),
  external_reference     TEXT,
  updated_by_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_catalog_entitlements_window_check
    CHECK (valid_until IS NULL OR valid_until > valid_from)
);

DROP TRIGGER IF EXISTS set_updated_at
  ON public.account_catalog_entitlements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.account_catalog_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Composite keys let every catalog relation enforce account equality with a
-- foreign key, instead of trusting application filters.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contacts_id_account_unique'
      AND conrelid = 'public.contacts'::regclass
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_id_account_unique UNIQUE (id, account_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_id_account_unique'
      AND conrelid = 'public.conversations'::regclass
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_id_account_unique UNIQUE (id, account_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deals_id_account_unique'
      AND conrelid = 'public.deals'::regclass
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_id_account_unique UNIQUE (id, account_id);
  END IF;
END;
$$;

-- ============================================================================
-- 2. GENERIC CATALOG CORE + VEHICLE DETAILS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.catalog_items (
  id                     UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id             UUID NOT NULL
                         REFERENCES public.accounts(id) ON DELETE CASCADE,
  item_type              TEXT NOT NULL DEFAULT 'vehicle'
                         CHECK (item_type ~ '^[a-z][a-z0-9_]{2,39}$'),
  internal_code          TEXT NOT NULL
                         CHECK (length(trim(internal_code)) BETWEEN 1 AND 80),
  title                  TEXT NOT NULL
                         CHECK (length(trim(title)) BETWEEN 2 AND 180),
  description            TEXT NOT NULL DEFAULT ''
                         CHECK (length(description) <= 10000),
  status                 TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN (
                           'draft',
                           'pending_approval',
                           'available',
                           'reserved',
                           'sold',
                           'inactive',
                           'archived'
                         )),
  visibility             TEXT NOT NULL DEFAULT 'internal'
                         CHECK (visibility IN ('internal', 'shareable')),
  created_by_user_id     UUID NOT NULL
                         REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by_user_id     UUID NOT NULL
                         REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at           TIMESTAMPTZ,
  approved_at            TIMESTAMPTZ,
  sold_at                TIMESTAMPTZ,
  archived_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_items_id_account_unique UNIQUE (id, account_id),
  CONSTRAINT catalog_items_approval_state_check CHECK (
    (approved_at IS NULL AND approved_by_user_id IS NULL)
    OR
    (approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL)
  ),
  CONSTRAINT catalog_items_sold_state_check CHECK (
    status <> 'sold' OR sold_at IS NOT NULL
  ),
  CONSTRAINT catalog_items_archived_state_check CHECK (
    status <> 'archived' OR archived_at IS NOT NULL
  ),
  CONSTRAINT catalog_items_shareable_state_check CHECK (
    visibility <> 'shareable' OR status = 'available'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_account_code_unique
  ON public.catalog_items (
    account_id,
    item_type,
    lower(trim(internal_code))
  );
CREATE INDEX IF NOT EXISTS idx_catalog_items_account_status_updated
  ON public.catalog_items(account_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_items_account_type_created
  ON public.catalog_items(account_id, item_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_items_creator_status
  ON public.catalog_items(account_id, created_by_user_id, status);

DROP TRIGGER IF EXISTS set_updated_at ON public.catalog_items;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.catalog_vehicle_details (
  item_id                        UUID PRIMARY KEY,
  account_id                     UUID NOT NULL,
  license_plate                  TEXT,
  license_plate_normalized       TEXT GENERATED ALWAYS AS (
    upper(regexp_replace(COALESCE(license_plate, ''), '[^A-Za-z0-9]', '', 'g'))
  ) STORED,
  license_plate_visible          BOOLEAN NOT NULL DEFAULT FALSE,
  make                           TEXT NOT NULL
                                 CHECK (length(trim(make)) BETWEEN 1 AND 80),
  model                          TEXT NOT NULL
                                 CHECK (length(trim(model)) BETWEEN 1 AND 80),
  version                        TEXT NOT NULL DEFAULT ''
                                 CHECK (length(version) <= 120),
  model_year                     SMALLINT NOT NULL
                                 CHECK (model_year BETWEEN 1886 AND 2200),
  color                          TEXT NOT NULL DEFAULT ''
                                 CHECK (length(color) <= 80),
  engine                         TEXT NOT NULL DEFAULT ''
                                 CHECK (length(engine) <= 120),
  fuel                           TEXT NOT NULL DEFAULT 'other'
                                 CHECK (fuel IN (
                                   'gasoline', 'diesel', 'hybrid',
                                   'electric', 'gas', 'other'
                                 )),
  transmission                   TEXT NOT NULL DEFAULT 'other'
                                 CHECK (transmission IN (
                                   'manual', 'automatic', 'cvt',
                                   'dual_clutch', 'other'
                                 )),
  drivetrain                     TEXT NOT NULL DEFAULT 'other'
                                 CHECK (drivetrain IN (
                                   '4x2', '4x4', 'awd', 'fwd', 'rwd', 'other'
                                 )),
  mileage_km                     BIGINT NOT NULL DEFAULT 0
                                 CHECK (mileage_km >= 0),
  list_price                     NUMERIC(14, 2) NOT NULL
                                 CHECK (list_price >= 0),
  offer_price                    NUMERIC(14, 2)
                                 CHECK (offer_price IS NULL OR offer_price >= 0),
  minimum_down_payment           NUMERIC(14, 2)
                                 CHECK (
                                   minimum_down_payment IS NULL
                                   OR minimum_down_payment >= 0
                                 ),
  financing_text                 TEXT NOT NULL DEFAULT ''
                                 CHECK (length(financing_text) <= 3000),
  technical_review_expires_on    DATE,
  circulation_permit_expires_on  DATE,
  current_location               TEXT NOT NULL DEFAULT ''
                                 CHECK (length(current_location) <= 160),
  location_description           TEXT NOT NULL DEFAULT ''
                                 CHECK (length(location_description) <= 2000),
  updated_by_user_id             UUID NOT NULL
                                 REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_vehicle_details_item_account_fkey
    FOREIGN KEY (item_id, account_id)
    REFERENCES public.catalog_items(id, account_id) ON DELETE CASCADE,
  CONSTRAINT catalog_vehicle_offer_price_check
    CHECK (offer_price IS NULL OR offer_price <= list_price)
);

-- A plate match is a duplicate warning, not a permanent database rejection:
-- a sold or archived vehicle may legitimately return to inventory later.
CREATE INDEX IF NOT EXISTS idx_catalog_vehicle_plate_lookup
  ON public.catalog_vehicle_details(account_id, license_plate_normalized)
  WHERE license_plate_normalized <> '';
CREATE INDEX IF NOT EXISTS idx_catalog_vehicle_search
  ON public.catalog_vehicle_details(
    account_id,
    make,
    model,
    model_year DESC
  );
CREATE INDEX IF NOT EXISTS idx_catalog_vehicle_price
  ON public.catalog_vehicle_details(
    account_id,
    COALESCE(offer_price, list_price)
  );
CREATE INDEX IF NOT EXISTS idx_catalog_vehicle_location
  ON public.catalog_vehicle_details(account_id, current_location);

DROP TRIGGER IF EXISTS set_updated_at
  ON public.catalog_vehicle_details;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.catalog_vehicle_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3. IMAGES, APPROVALS AND AUDIT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.catalog_item_images (
  id                 UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id         UUID NOT NULL,
  catalog_item_id    UUID NOT NULL,
  storage_bucket     TEXT NOT NULL DEFAULT 'catalog-media'
                     CHECK (storage_bucket = 'catalog-media'),
  storage_path       TEXT NOT NULL
                     CHECK (length(storage_path) BETWEEN 10 AND 1000),
  mime_type          TEXT NOT NULL
                     CHECK (mime_type IN (
                       'image/jpeg', 'image/png', 'image/webp'
                     )),
  byte_size          BIGINT NOT NULL
                     CHECK (byte_size BETWEEN 1 AND 5242880),
  width              INTEGER CHECK (width IS NULL OR width > 0),
  height             INTEGER CHECK (height IS NULL OR height > 0),
  alt_text           TEXT NOT NULL DEFAULT ''
                     CHECK (length(alt_text) <= 300),
  sort_order         INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_primary         BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by_user_id UUID NOT NULL
                      REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_item_images_id_account_unique UNIQUE (id, account_id),
  CONSTRAINT catalog_item_images_item_account_fkey
    FOREIGN KEY (catalog_item_id, account_id)
    REFERENCES public.catalog_items(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT catalog_item_images_storage_unique
    UNIQUE (storage_bucket, storage_path)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_item_primary_image_unique
  ON public.catalog_item_images(catalog_item_id)
  WHERE is_primary;
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_item_image_order_unique
  ON public.catalog_item_images(catalog_item_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_catalog_item_images_account_item
  ON public.catalog_item_images(account_id, catalog_item_id, sort_order);

CREATE TABLE IF NOT EXISTS public.catalog_approvals (
  id                   UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id           UUID NOT NULL,
  catalog_item_id      UUID NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN (
                         'pending', 'approved', 'rejected', 'cancelled'
                       )),
  requested_by_user_id UUID NOT NULL
                       REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_by_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  request_snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_reason        TEXT CHECK (
                         review_reason IS NULL
                         OR length(trim(review_reason)) BETWEEN 1 AND 3000
                       ),
  requested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_approvals_id_account_unique UNIQUE (id, account_id),
  CONSTRAINT catalog_approvals_item_account_fkey
    FOREIGN KEY (catalog_item_id, account_id)
    REFERENCES public.catalog_items(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT catalog_approvals_review_state_check CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL)
    OR
    (
      status IN ('approved', 'rejected', 'cancelled')
      AND reviewed_at IS NOT NULL
    )
  ),
  CONSTRAINT catalog_approvals_rejection_reason_check CHECK (
    status <> 'rejected' OR review_reason IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_approval_one_pending
  ON public.catalog_approvals(catalog_item_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_catalog_approvals_account_status
  ON public.catalog_approvals(account_id, status, requested_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.catalog_approvals;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.catalog_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.catalog_item_activity (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id      UUID NOT NULL,
  catalog_item_id UUID NOT NULL,
  action          TEXT NOT NULL CHECK (action IN (
                    'created',
                    'details_updated',
                    'price_changed',
                    'submitted',
                    'approved',
                    'rejected',
                    'status_changed',
                    'image_added',
                    'image_removed',
                    'shared',
                    'marked_primary_interest',
                    'sold',
                    'archived'
                  )),
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_data   JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_item_activity_item_account_fkey
    FOREIGN KEY (catalog_item_id, account_id)
    REFERENCES public.catalog_items(id, account_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_catalog_activity_item_created
  ON public.catalog_item_activity(catalog_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_activity_account_action
  ON public.catalog_item_activity(account_id, action, created_at DESC);

-- ============================================================================
-- 4. SHARES AND CONTACT INTERESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.catalog_share_batches (
  id                    UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id            UUID NOT NULL,
  contact_id            UUID NOT NULL,
  conversation_id       UUID NOT NULL,
  deal_id               UUID,
  actor_user_id         UUID NOT NULL
                        REFERENCES auth.users(id) ON DELETE RESTRICT,
  channel               TEXT NOT NULL
                        CHECK (channel IN (
                          'whatsapp', 'facebook', 'instagram'
                        )),
  whatsapp_config_id    UUID,
  channel_connection_id UUID,
  introduction_text     TEXT NOT NULL DEFAULT ''
                        CHECK (length(introduction_text) <= 2000),
  intro_message_id      UUID REFERENCES public.messages(id)
                        ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                          'pending', 'sending', 'sent', 'partial', 'failed'
                        )),
  error_code            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  CONSTRAINT catalog_share_batches_id_account_unique
    UNIQUE (id, account_id),
  CONSTRAINT catalog_share_batches_contact_account_fkey
    FOREIGN KEY (contact_id, account_id)
    REFERENCES public.contacts(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT catalog_share_batches_conversation_account_fkey
    FOREIGN KEY (conversation_id, account_id)
    REFERENCES public.conversations(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT catalog_share_batches_deal_account_fkey
    FOREIGN KEY (deal_id, account_id)
    REFERENCES public.deals(id, account_id) ON DELETE SET NULL,
  CONSTRAINT catalog_share_batches_whatsapp_account_fkey
    FOREIGN KEY (whatsapp_config_id, account_id)
    REFERENCES public.whatsapp_config(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT catalog_share_batches_social_account_fkey
    FOREIGN KEY (channel_connection_id, account_id)
    REFERENCES public.channel_connections(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT catalog_share_batches_channel_pairing_check CHECK (
    (
      channel = 'whatsapp'
      AND whatsapp_config_id IS NOT NULL
      AND channel_connection_id IS NULL
    )
    OR
    (
      channel IN ('facebook', 'instagram')
      AND whatsapp_config_id IS NULL
      AND channel_connection_id IS NOT NULL
    )
  ),
  CONSTRAINT catalog_share_batches_completion_check CHECK (
    (status IN ('pending', 'sending') AND completed_at IS NULL)
    OR
    (status IN ('sent', 'partial', 'failed') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_catalog_share_batch_contact_created
  ON public.catalog_share_batches(account_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_share_batch_conversation_created
  ON public.catalog_share_batches(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.catalog_item_shares (
  id                   UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id           UUID NOT NULL,
  share_batch_id       UUID NOT NULL,
  catalog_item_id      UUID NOT NULL,
  position             SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 5),
  commercial_snapshot  JSONB NOT NULL,
  displayed_price      NUMERIC(14, 2) NOT NULL CHECK (displayed_price >= 0),
  item_status_snapshot TEXT NOT NULL,
  sent_text            TEXT NOT NULL CHECK (length(sent_text) BETWEEN 1 AND 5000),
  message_id           UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  external_message_id  TEXT,
  result               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (result IN ('pending', 'sent', 'failed')),
  error_code           TEXT,
  error_message        TEXT CHECK (
                         error_message IS NULL
                         OR length(error_message) <= 1000
                       ),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  CONSTRAINT catalog_item_shares_batch_account_fkey
    FOREIGN KEY (share_batch_id, account_id)
    REFERENCES public.catalog_share_batches(id, account_id) ON DELETE CASCADE,
  CONSTRAINT catalog_item_shares_item_account_fkey
    FOREIGN KEY (catalog_item_id, account_id)
    REFERENCES public.catalog_items(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT catalog_item_shares_batch_item_unique
    UNIQUE (share_batch_id, catalog_item_id),
  CONSTRAINT catalog_item_shares_batch_position_unique
    UNIQUE (share_batch_id, position),
  CONSTRAINT catalog_item_shares_completion_check CHECK (
    (result = 'pending' AND completed_at IS NULL)
    OR
    (result IN ('sent', 'failed') AND completed_at IS NOT NULL)
  ),
  CONSTRAINT catalog_item_shares_status_snapshot_check CHECK (
    item_status_snapshot IN (
      'draft',
      'pending_approval',
      'available',
      'reserved',
      'sold',
      'inactive',
      'archived'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_catalog_item_shares_item_created
  ON public.catalog_item_shares(catalog_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_item_shares_batch
  ON public.catalog_item_shares(share_batch_id, position);

CREATE TABLE IF NOT EXISTS public.contact_catalog_interests (
  id                  UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id          UUID NOT NULL,
  contact_id          UUID NOT NULL,
  catalog_item_id     UUID NOT NULL,
  deal_id             UUID,
  source              TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'shared', 'inbound_query')),
  is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
  first_shared_at     TIMESTAMPTZ,
  last_shared_at      TIMESTAMPTZ,
  created_by_user_id  UUID NOT NULL
                      REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by_user_id  UUID NOT NULL
                      REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contact_catalog_interests_contact_account_fkey
    FOREIGN KEY (contact_id, account_id)
    REFERENCES public.contacts(id, account_id) ON DELETE CASCADE,
  CONSTRAINT contact_catalog_interests_item_account_fkey
    FOREIGN KEY (catalog_item_id, account_id)
    REFERENCES public.catalog_items(id, account_id) ON DELETE RESTRICT,
  CONSTRAINT contact_catalog_interests_deal_account_fkey
    FOREIGN KEY (deal_id, account_id)
    REFERENCES public.deals(id, account_id) ON DELETE SET NULL,
  CONSTRAINT contact_catalog_interests_contact_item_unique
    UNIQUE (account_id, contact_id, catalog_item_id),
  CONSTRAINT contact_catalog_interests_share_window_check CHECK (
    first_shared_at IS NULL
    OR last_shared_at IS NULL
    OR last_shared_at >= first_shared_at
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_one_primary_catalog_interest
  ON public.contact_catalog_interests(account_id, contact_id)
  WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_contact_catalog_interests_contact
  ON public.contact_catalog_interests(account_id, contact_id, updated_at DESC);

DROP TRIGGER IF EXISTS set_updated_at
  ON public.contact_catalog_interests;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.contact_catalog_interests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 5. CENTRAL AUDIT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_catalog_item_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.catalog_item_activity (
      account_id,
      catalog_item_id,
      action,
      actor_user_id,
      next_data
    ) VALUES (
      NEW.account_id,
      NEW.id,
      'created',
      NEW.created_by_user_id,
      to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_action := CASE
    WHEN OLD.status = 'draft' AND NEW.status = 'pending_approval'
      THEN 'submitted'
    WHEN OLD.status = 'pending_approval' AND NEW.status = 'available'
      THEN 'approved'
    WHEN OLD.status = 'pending_approval' AND NEW.status = 'draft'
      THEN 'rejected'
    WHEN NEW.status = 'sold' THEN 'sold'
    WHEN NEW.status = 'archived' THEN 'archived'
    ELSE 'status_changed'
  END;

  INSERT INTO public.catalog_item_activity (
    account_id,
    catalog_item_id,
    action,
    actor_user_id,
    previous_data,
    next_data
  ) VALUES (
    NEW.account_id,
    NEW.id,
    v_action,
    NEW.updated_by_user_id,
    jsonb_build_object('status', OLD.status),
    jsonb_build_object('status', NEW.status)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_catalog_vehicle_details()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_action TEXT := 'details_updated';
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.list_price IS DISTINCT FROM OLD.list_price
     OR NEW.offer_price IS DISTINCT FROM OLD.offer_price
     OR NEW.minimum_down_payment
        IS DISTINCT FROM OLD.minimum_down_payment THEN
    v_action := 'price_changed';
  END IF;

  INSERT INTO public.catalog_item_activity (
    account_id,
    catalog_item_id,
    action,
    actor_user_id,
    previous_data,
    next_data
  ) VALUES (
    NEW.account_id,
    NEW.item_id,
    v_action,
    NEW.updated_by_user_id,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_catalog_image()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.catalog_item_activity (
    account_id,
    catalog_item_id,
    action,
    actor_user_id,
    previous_data,
    next_data
  ) VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.account_id ELSE NEW.account_id END,
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.catalog_item_id
      ELSE NEW.catalog_item_id
    END,
    CASE WHEN TG_OP = 'DELETE' THEN 'image_removed' ELSE 'image_added' END,
    CASE
      WHEN TG_OP = 'DELETE' THEN COALESCE(auth.uid(), OLD.uploaded_by_user_id)
      ELSE NEW.uploaded_by_user_id
    END,
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END,
    CASE WHEN TG_OP = 'INSERT' THEN to_jsonb(NEW) ELSE '{}'::jsonb END
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_catalog_share()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor UUID;
BEGIN
  IF NEW.result <> 'sent' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.result = 'sent' THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT batch.actor_user_id INTO v_actor
  FROM public.catalog_share_batches batch
  WHERE batch.id = NEW.share_batch_id;

  INSERT INTO public.catalog_item_activity (
    account_id,
    catalog_item_id,
    action,
    actor_user_id,
    next_data,
    metadata
  ) VALUES (
    NEW.account_id,
    NEW.catalog_item_id,
    'shared',
    v_actor,
    jsonb_build_object(
      'displayed_price', NEW.displayed_price,
      'message_id', NEW.message_id,
      'external_message_id', NEW.external_message_id
    ),
    jsonb_build_object('share_batch_id', NEW.share_batch_id)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_primary_catalog_interest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT NEW.is_primary THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_primary THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.catalog_item_activity (
    account_id,
    catalog_item_id,
    action,
    actor_user_id,
    next_data
  ) VALUES (
    NEW.account_id,
    NEW.catalog_item_id,
    'marked_primary_interest',
    NEW.updated_by_user_id,
    jsonb_build_object(
      'contact_id', NEW.contact_id,
      'deal_id', NEW.deal_id
    )
  );

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.audit_catalog_item_row() OWNER TO postgres;
ALTER FUNCTION public.audit_catalog_vehicle_details() OWNER TO postgres;
ALTER FUNCTION public.audit_catalog_image() OWNER TO postgres;
ALTER FUNCTION public.audit_catalog_share() OWNER TO postgres;
ALTER FUNCTION public.audit_primary_catalog_interest() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_catalog_item_audit
  ON public.catalog_items;
CREATE TRIGGER on_catalog_item_audit
  AFTER INSERT OR UPDATE OF status
  ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_item_row();

DROP TRIGGER IF EXISTS on_catalog_vehicle_details_audit
  ON public.catalog_vehicle_details;
CREATE TRIGGER on_catalog_vehicle_details_audit
  AFTER UPDATE
  ON public.catalog_vehicle_details
  FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_vehicle_details();

DROP TRIGGER IF EXISTS on_catalog_image_audit
  ON public.catalog_item_images;
CREATE TRIGGER on_catalog_image_audit
  AFTER INSERT OR DELETE
  ON public.catalog_item_images
  FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_image();

DROP TRIGGER IF EXISTS on_catalog_share_audit
  ON public.catalog_item_shares;
CREATE TRIGGER on_catalog_share_audit
  AFTER INSERT OR UPDATE OF result
  ON public.catalog_item_shares
  FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_share();

DROP TRIGGER IF EXISTS on_primary_catalog_interest_audit
  ON public.contact_catalog_interests;
CREATE TRIGGER on_primary_catalog_interest_audit
  AFTER INSERT OR UPDATE OF is_primary
  ON public.contact_catalog_interests
  FOR EACH ROW EXECUTE FUNCTION public.audit_primary_catalog_interest();

-- ============================================================================
-- 6. AUTHORIZATION HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_can_view_item(
  target_item_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.catalog_items item
    JOIN public.profiles profile
      ON profile.user_id = auth.uid()
     AND profile.account_id = item.account_id
    WHERE item.id = target_item_id
      AND (
        profile.account_role::TEXT IN (
          'owner', 'admin', 'supervisor', 'viewer'
        )
        OR
        (
          profile.account_role::TEXT = 'agent'
          AND (
            item.created_by_user_id = auth.uid()
            OR item.status IN ('available', 'reserved')
            OR EXISTS (
              SELECT 1
              FROM public.catalog_item_shares item_share
              JOIN public.catalog_share_batches batch
                ON batch.id = item_share.share_batch_id
              WHERE item_share.catalog_item_id = item.id
                AND public.can_view_ticket(batch.conversation_id)
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.catalog_can_manage_item(
  target_item_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.catalog_items item
    JOIN public.profiles profile
      ON profile.user_id = auth.uid()
     AND profile.account_id = item.account_id
    WHERE item.id = target_item_id
      AND (
        profile.account_role::TEXT IN ('owner', 'admin', 'supervisor')
        OR (
          profile.account_role::TEXT = 'agent'
          AND item.created_by_user_id = auth.uid()
          AND item.status = 'draft'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.catalog_can_view_contact(
  target_contact_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contacts contact
    JOIN public.profiles profile
      ON profile.user_id = auth.uid()
     AND profile.account_id = contact.account_id
    WHERE contact.id = target_contact_id
      AND (
        profile.account_role::TEXT IN (
          'owner', 'admin', 'supervisor', 'viewer'
        )
        OR (
          profile.account_role::TEXT = 'agent'
          AND EXISTS (
            SELECT 1
            FROM public.conversations conversation
            WHERE conversation.contact_id = contact.id
              AND public.can_view_ticket(conversation.id)
          )
        )
      )
  );
$$;

ALTER FUNCTION public.catalog_can_view_item(UUID) OWNER TO postgres;
ALTER FUNCTION public.catalog_can_manage_item(UUID) OWNER TO postgres;
ALTER FUNCTION public.catalog_can_view_contact(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.catalog_can_view_item(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_can_manage_item(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_can_view_contact(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_can_view_item(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_can_manage_item(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_can_view_contact(UUID)
  TO authenticated, service_role;

-- ============================================================================
-- 7. CAPACITY AND CONCURRENCY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_status_consumes_capacity(
  target_status TEXT
) RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT target_status IN (
    'draft', 'pending_approval', 'available', 'reserved'
  );
$$;

CREATE OR REPLACE FUNCTION public.catalog_capacity_limit(
  target_account_id UUID
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    plan.max_active_catalog_items
    + COALESCE(entitlement.extra_blocks, 0)
      * COALESCE(entitlement.block_units_snapshot, 10)
  FROM public.accounts account
  JOIN public.saas_plans plan ON plan.code = account.plan_code
  LEFT JOIN public.account_catalog_entitlements entitlement
    ON entitlement.account_id = account.id
   AND entitlement.valid_from <= NOW()
   AND (
     entitlement.valid_until IS NULL
     OR entitlement.valid_until > NOW()
   )
  WHERE account.id = target_account_id;
$$;

CREATE OR REPLACE FUNCTION public.catalog_active_usage(
  target_account_id UUID
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.catalog_items item
  WHERE item.account_id = target_account_id
    AND public.catalog_status_consumes_capacity(item.status);
$$;

CREATE OR REPLACE FUNCTION public.catalog_capacity_snapshot()
RETURNS TABLE (
  account_id UUID,
  plan_code TEXT,
  base_limit INTEGER,
  extra_blocks INTEGER,
  extra_units INTEGER,
  total_limit INTEGER,
  used_units INTEGER,
  remaining_units INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT profile.account_id INTO v_account_id
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'catalog_account_not_found' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    account.id,
    account.plan_code,
    plan.max_active_catalog_items,
    COALESCE(entitlement.extra_blocks, 0),
    COALESCE(entitlement.extra_blocks, 0)
      * COALESCE(entitlement.block_units_snapshot, 10),
    public.catalog_capacity_limit(account.id),
    public.catalog_active_usage(account.id),
    GREATEST(
      public.catalog_capacity_limit(account.id)
        - public.catalog_active_usage(account.id),
      0
    )
  FROM public.accounts account
  JOIN public.saas_plans plan ON plan.code = account.plan_code
  LEFT JOIN public.account_catalog_entitlements entitlement
    ON entitlement.account_id = account.id
   AND entitlement.valid_from <= NOW()
   AND (
     entitlement.valid_until IS NULL
     OR entitlement.valid_until > NOW()
   )
  WHERE account.id = v_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_catalog_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_limit INTEGER;
  v_usage INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'catalog_account_cannot_change' USING ERRCODE = '42501';
  END IF;

  IF NOT public.catalog_status_consumes_capacity(NEW.status) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND public.catalog_status_consumes_capacity(OLD.status) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.account_id::TEXT, 51)
  );

  v_limit := public.catalog_capacity_limit(NEW.account_id);
  v_usage := public.catalog_active_usage(NEW.account_id);

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'catalog_plan_limit_not_configured'
      USING ERRCODE = '22023';
  END IF;

  IF v_usage >= v_limit THEN
    RAISE EXCEPTION 'catalog_capacity_reached'
      USING
        ERRCODE = 'P0001',
        DETAIL = format(
          'The account has %s active catalog items and a limit of %s.',
          v_usage,
          v_limit
        );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_catalog_capacity
  ON public.catalog_items;
CREATE TRIGGER enforce_catalog_capacity
  BEFORE INSERT OR UPDATE OF account_id, status
  ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_catalog_capacity();

CREATE OR REPLACE FUNCTION public.guard_catalog_entitlement_reduction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_base INTEGER;
  v_next_limit INTEGER;
  v_usage INTEGER;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'catalog_entitlement_account_cannot_change'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      CASE WHEN TG_OP = 'DELETE'
        THEN OLD.account_id::TEXT
        ELSE NEW.account_id::TEXT
      END,
      51
    )
  );

  IF TG_OP = 'DELETE' THEN
    SELECT plan.max_active_catalog_items INTO v_base
    FROM public.accounts account
    JOIN public.saas_plans plan ON plan.code = account.plan_code
    WHERE account.id = OLD.account_id;
    v_next_limit := v_base;
    v_usage := public.catalog_active_usage(OLD.account_id);
  ELSE
    SELECT plan.max_active_catalog_items INTO v_base
    FROM public.accounts account
    JOIN public.saas_plans plan ON plan.code = account.plan_code
    WHERE account.id = NEW.account_id;
    v_next_limit := v_base + CASE
      WHEN NEW.valid_from <= NOW()
       AND (NEW.valid_until IS NULL OR NEW.valid_until > NOW())
        THEN NEW.extra_blocks * NEW.block_units_snapshot
      ELSE 0
    END;
    v_usage := public.catalog_active_usage(NEW.account_id);
  END IF;

  IF v_usage > v_next_limit THEN
    RAISE EXCEPTION 'catalog_capacity_reduction_conflict'
      USING
        ERRCODE = 'P0001',
        DETAIL = format(
          'The account uses %s units and the proposed limit is %s.',
          v_usage,
          v_next_limit
        );
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS guard_catalog_entitlement_reduction
  ON public.account_catalog_entitlements;
CREATE TRIGGER guard_catalog_entitlement_reduction
  BEFORE UPDATE OF
      account_id,
      extra_blocks,
      block_units_snapshot,
      valid_from,
      valid_until
      OR DELETE
  ON public.account_catalog_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.guard_catalog_entitlement_reduction();

CREATE OR REPLACE FUNCTION public.guard_catalog_plan_downgrade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_base INTEGER;
  v_extra INTEGER;
  v_usage INTEGER;
BEGIN
  IF NEW.plan_code IS NOT DISTINCT FROM OLD.plan_code THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.id::TEXT, 51)
  );

  SELECT max_active_catalog_items INTO v_base
  FROM public.saas_plans
  WHERE code = NEW.plan_code;

  SELECT COALESCE(extra_blocks * block_units_snapshot, 0) INTO v_extra
  FROM public.account_catalog_entitlements
  WHERE account_id = NEW.id
    AND valid_from <= NOW()
    AND (valid_until IS NULL OR valid_until > NOW());

  v_usage := public.catalog_active_usage(NEW.id);

  IF v_usage > COALESCE(v_base, 0) + COALESCE(v_extra, 0) THEN
    RAISE EXCEPTION 'catalog_plan_downgrade_conflict'
      USING
        ERRCODE = 'P0001',
        DETAIL = format(
          'The account uses %s catalog units and the new plan allows %s.',
          v_usage,
          COALESCE(v_base, 0) + COALESCE(v_extra, 0)
        );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_catalog_plan_downgrade ON public.accounts;
CREATE TRIGGER guard_catalog_plan_downgrade
  BEFORE UPDATE OF plan_code ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_catalog_plan_downgrade();

ALTER FUNCTION public.catalog_status_consumes_capacity(TEXT)
  OWNER TO postgres;
ALTER FUNCTION public.catalog_capacity_limit(UUID) OWNER TO postgres;
ALTER FUNCTION public.catalog_active_usage(UUID) OWNER TO postgres;
ALTER FUNCTION public.catalog_capacity_snapshot() OWNER TO postgres;
ALTER FUNCTION public.enforce_catalog_capacity() OWNER TO postgres;
ALTER FUNCTION public.guard_catalog_entitlement_reduction() OWNER TO postgres;
ALTER FUNCTION public.guard_catalog_plan_downgrade() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.catalog_capacity_limit(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_active_usage(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_capacity_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_capacity_limit(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_active_usage(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_capacity_snapshot()
  TO authenticated;

-- ============================================================================
-- 8. APPROVAL AND STATUS RPCS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_catalog_item(
  p_catalog_item_id UUID
) RETURNS public.catalog_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_item public.catalog_items%ROWTYPE;
  v_snapshot JSONB;
BEGIN
  SELECT * INTO v_item
  FROM public.catalog_items
  WHERE id = p_catalog_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.catalog_can_manage_item(v_item.id) THEN
    RAISE EXCEPTION 'catalog_item_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_item.status <> 'draft' THEN
    RAISE EXCEPTION 'catalog_item_must_be_draft' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_vehicle_details detail
    WHERE detail.item_id = v_item.id
  ) THEN
    RAISE EXCEPTION 'catalog_vehicle_details_required' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_item_images image
    WHERE image.catalog_item_id = v_item.id AND image.is_primary
  ) THEN
    RAISE EXCEPTION 'catalog_primary_image_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT jsonb_build_object(
    'item', to_jsonb(item),
    'vehicle', to_jsonb(detail),
    'images', COALESCE((
      SELECT jsonb_agg(to_jsonb(image) ORDER BY image.sort_order)
      FROM public.catalog_item_images image
      WHERE image.catalog_item_id = item.id
    ), '[]'::jsonb)
  )
  INTO v_snapshot
  FROM public.catalog_items item
  JOIN public.catalog_vehicle_details detail ON detail.item_id = item.id
  WHERE item.id = v_item.id;

  UPDATE public.catalog_items
  SET
    status = 'pending_approval',
    submitted_at = NOW(),
    updated_by_user_id = auth.uid()
  WHERE id = v_item.id
  RETURNING * INTO v_item;

  INSERT INTO public.catalog_approvals (
    account_id,
    catalog_item_id,
    status,
    requested_by_user_id,
    request_snapshot
  ) VALUES (
    v_item.account_id,
    v_item.id,
    'pending',
    auth.uid(),
    v_snapshot
  );

  RETURN v_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_catalog_item(
  p_catalog_item_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS public.catalog_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_item public.catalog_items%ROWTYPE;
  v_role TEXT;
  v_next_status TEXT;
BEGIN
  SELECT * INTO v_item
  FROM public.catalog_items
  WHERE id = p_catalog_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.current_account_role(v_item.account_id);
  IF v_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RAISE EXCEPTION 'catalog_review_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_item.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'catalog_item_not_pending' USING ERRCODE = 'P0001';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'catalog_invalid_review_decision' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'rejected'
     AND length(trim(COALESCE(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'catalog_rejection_reason_required'
      USING ERRCODE = 'P0001';
  END IF;

  v_next_status := CASE
    WHEN p_decision = 'approved' THEN 'available'
    ELSE 'draft'
  END;

  UPDATE public.catalog_approvals
  SET
    status = p_decision,
    reviewed_by_user_id = auth.uid(),
    review_reason = NULLIF(trim(COALESCE(p_reason, '')), ''),
    reviewed_at = NOW()
  WHERE catalog_item_id = v_item.id
    AND status = 'pending';

  UPDATE public.catalog_items
  SET
    status = v_next_status,
    visibility = CASE
      WHEN p_decision = 'approved' THEN 'shareable'
      ELSE 'internal'
    END,
    approved_by_user_id = CASE
      WHEN p_decision = 'approved' THEN auth.uid()
      ELSE NULL
    END,
    approved_at = CASE
      WHEN p_decision = 'approved' THEN NOW()
      ELSE NULL
    END,
    updated_by_user_id = auth.uid()
  WHERE id = v_item.id
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_catalog_item_status(
  p_catalog_item_id UUID,
  p_status TEXT
) RETURNS public.catalog_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_item public.catalog_items%ROWTYPE;
  v_role TEXT;
  v_allowed BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_item
  FROM public.catalog_items
  WHERE id = p_catalog_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.current_account_role(v_item.account_id);
  IF v_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RAISE EXCEPTION 'catalog_status_forbidden' USING ERRCODE = '42501';
  END IF;

  v_allowed := CASE v_item.status
    WHEN 'draft' THEN p_status IN ('inactive', 'archived')
    WHEN 'available' THEN p_status IN (
      'reserved', 'sold', 'inactive', 'archived'
    )
    WHEN 'reserved' THEN p_status IN (
      'available', 'sold', 'inactive', 'archived'
    )
    WHEN 'sold' THEN p_status = 'archived'
    WHEN 'inactive' THEN p_status IN ('draft', 'available', 'archived')
    ELSE FALSE
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'catalog_invalid_status_transition'
      USING
        ERRCODE = 'P0001',
        DETAIL = format('%s -> %s is not allowed', v_item.status, p_status);
  END IF;

  IF p_status = 'available'
     AND (
       v_item.approved_at IS NULL
       OR v_item.approved_by_user_id IS NULL
     ) THEN
    RAISE EXCEPTION 'catalog_item_requires_approval'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.catalog_items
  SET
    status = p_status,
    visibility = CASE
      WHEN p_status = 'available' THEN 'shareable'
      ELSE 'internal'
    END,
    sold_at = CASE WHEN p_status = 'sold' THEN NOW() ELSE sold_at END,
    archived_at = CASE WHEN p_status = 'archived' THEN NOW() ELSE archived_at END,
    updated_by_user_id = auth.uid()
  WHERE id = v_item.id
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

ALTER FUNCTION public.submit_catalog_item(UUID) OWNER TO postgres;
ALTER FUNCTION public.review_catalog_item(UUID, TEXT, TEXT) OWNER TO postgres;
ALTER FUNCTION public.set_catalog_item_status(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_catalog_item(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_catalog_item(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_catalog_item_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_catalog_item(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_catalog_item(UUID, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_catalog_item_status(UUID, TEXT)
  TO authenticated;

-- ============================================================================
-- 9. NOTIFICATIONS FOR APPROVAL WORKFLOW
-- ============================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS catalog_item_id UUID
  REFERENCES public.catalog_items(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'conversation_assigned',
    'catalog_approval_requested',
    'catalog_item_approved',
    'catalog_item_rejected'
  ));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_subject_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_subject_check CHECK (
    (
      type = 'conversation_assigned'
      AND conversation_id IS NOT NULL
      AND catalog_item_id IS NULL
    )
    OR
    (
      type IN (
        'catalog_approval_requested',
        'catalog_item_approved',
        'catalog_item_rejected'
      )
      AND catalog_item_id IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_notifications_catalog_item
  ON public.notifications(catalog_item_id, created_at DESC)
  WHERE catalog_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_catalog_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_title TEXT;
  v_creator UUID;
BEGIN
  SELECT title, created_by_user_id
  INTO v_title, v_creator
  FROM public.catalog_items
  WHERE id = NEW.catalog_item_id;

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    INSERT INTO public.notifications (
      account_id,
      user_id,
      type,
      catalog_item_id,
      actor_user_id,
      title,
      body
    )
    SELECT
      NEW.account_id,
      profile.user_id,
      'catalog_approval_requested',
      NEW.catalog_item_id,
      NEW.requested_by_user_id,
      'Vehículo pendiente de aprobación',
      COALESCE(v_title, 'Una unidad') || ' necesita revisión.'
    FROM public.profiles profile
    WHERE profile.account_id = NEW.account_id
      AND profile.account_role::TEXT IN ('owner', 'admin', 'supervisor')
      AND profile.user_id <> NEW.requested_by_user_id;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.status = 'pending'
        AND NEW.status IN ('approved', 'rejected')
        AND v_creator IS NOT NULL
        AND v_creator IS DISTINCT FROM NEW.reviewed_by_user_id THEN
    INSERT INTO public.notifications (
      account_id,
      user_id,
      type,
      catalog_item_id,
      actor_user_id,
      title,
      body
    ) VALUES (
      NEW.account_id,
      v_creator,
      CASE
        WHEN NEW.status = 'approved' THEN 'catalog_item_approved'
        ELSE 'catalog_item_rejected'
      END,
      NEW.catalog_item_id,
      NEW.reviewed_by_user_id,
      CASE
        WHEN NEW.status = 'approved' THEN 'Vehículo aprobado'
        ELSE 'Vehículo rechazado'
      END,
      CASE
        WHEN NEW.status = 'approved'
          THEN COALESCE(v_title, 'La unidad') || ' ya está disponible.'
        ELSE COALESCE(v_title, 'La unidad') || ' volvió a borrador.'
      END
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Catalog approval notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_catalog_approval() OWNER TO postgres;
DROP TRIGGER IF EXISTS on_catalog_approval_notification
  ON public.catalog_approvals;
CREATE TRIGGER on_catalog_approval_notification
  AFTER INSERT OR UPDATE OF status
  ON public.catalog_approvals
  FOR EACH ROW EXECUTE FUNCTION public.notify_catalog_approval();

-- ============================================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.account_catalog_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_vehicle_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_share_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_catalog_interests ENABLE ROW LEVEL SECURITY;

-- No browser writes. Mutations are performed by validated backend routes or
-- the explicitly granted lifecycle RPCs above.
REVOKE ALL ON TABLE
  public.account_catalog_entitlements,
  public.catalog_items,
  public.catalog_vehicle_details,
  public.catalog_item_images,
  public.catalog_approvals,
  public.catalog_item_activity,
  public.catalog_share_batches,
  public.catalog_item_shares,
  public.contact_catalog_interests
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.account_catalog_entitlements,
  public.catalog_items,
  public.catalog_vehicle_details,
  public.catalog_item_images,
  public.catalog_approvals,
  public.catalog_item_activity,
  public.catalog_share_batches,
  public.catalog_item_shares,
  public.contact_catalog_interests
TO authenticated;

DROP POLICY IF EXISTS account_catalog_entitlements_select
  ON public.account_catalog_entitlements;
CREATE POLICY account_catalog_entitlements_select
  ON public.account_catalog_entitlements FOR SELECT
  USING (public.current_account_role(account_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS catalog_items_select ON public.catalog_items;
CREATE POLICY catalog_items_select
  ON public.catalog_items FOR SELECT
  USING (public.catalog_can_view_item(id));

DROP POLICY IF EXISTS catalog_vehicle_details_select
  ON public.catalog_vehicle_details;
CREATE POLICY catalog_vehicle_details_select
  ON public.catalog_vehicle_details FOR SELECT
  USING (public.catalog_can_view_item(item_id));

DROP POLICY IF EXISTS catalog_item_images_select
  ON public.catalog_item_images;
CREATE POLICY catalog_item_images_select
  ON public.catalog_item_images FOR SELECT
  USING (public.catalog_can_view_item(catalog_item_id));

DROP POLICY IF EXISTS catalog_approvals_select
  ON public.catalog_approvals;
CREATE POLICY catalog_approvals_select
  ON public.catalog_approvals FOR SELECT
  USING (
    public.catalog_can_view_item(catalog_item_id)
    AND (
      requested_by_user_id = auth.uid()
      OR reviewed_by_user_id = auth.uid()
      OR public.current_account_role(account_id) IN (
        'owner', 'admin', 'supervisor'
      )
    )
  );

DROP POLICY IF EXISTS catalog_item_activity_select
  ON public.catalog_item_activity;
CREATE POLICY catalog_item_activity_select
  ON public.catalog_item_activity FOR SELECT
  USING (
    public.current_account_role(account_id) IN (
      'owner', 'admin', 'supervisor', 'viewer'
    )
    OR EXISTS (
      SELECT 1
      FROM public.catalog_items item
      WHERE item.id = catalog_item_id
        AND item.created_by_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS catalog_share_batches_select
  ON public.catalog_share_batches;
CREATE POLICY catalog_share_batches_select
  ON public.catalog_share_batches FOR SELECT
  USING (
    public.is_account_member(account_id)
    AND public.can_view_ticket(conversation_id)
  );

DROP POLICY IF EXISTS catalog_item_shares_select
  ON public.catalog_item_shares;
CREATE POLICY catalog_item_shares_select
  ON public.catalog_item_shares FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.catalog_share_batches batch
      WHERE batch.id = share_batch_id
        AND public.can_view_ticket(batch.conversation_id)
    )
  );

DROP POLICY IF EXISTS contact_catalog_interests_select
  ON public.contact_catalog_interests;
CREATE POLICY contact_catalog_interests_select
  ON public.contact_catalog_interests FOR SELECT
  USING (public.catalog_can_view_contact(contact_id));

-- ============================================================================
-- 11. PRIVATE STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'catalog-media',
  'catalog-media',
  FALSE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Required object path:
-- account-<account_id>/vehicles/<catalog_item_id>/<image_id>.<extension>

DROP POLICY IF EXISTS "Catalog media account read" ON storage.objects;
CREATE POLICY "Catalog media account read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'catalog-media'
    AND (storage.foldername(name))[2] = 'vehicles'
    AND EXISTS (
      SELECT 1
      FROM public.catalog_items item
      WHERE ('account-' || item.account_id::TEXT)
              = (storage.foldername(name))[1]
        AND item.id::TEXT = (storage.foldername(name))[3]
        AND public.catalog_can_view_item(item.id)
    )
  );

DROP POLICY IF EXISTS "Catalog media authorized upload" ON storage.objects;
CREATE POLICY "Catalog media authorized upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'catalog-media'
    AND (storage.foldername(name))[2] = 'vehicles'
    AND array_length(storage.foldername(name), 1) = 3
    AND EXISTS (
      SELECT 1
      FROM public.catalog_items item
      WHERE ('account-' || item.account_id::TEXT)
              = (storage.foldername(name))[1]
        AND item.id::TEXT = (storage.foldername(name))[3]
        AND public.catalog_can_manage_item(item.id)
    )
  );

DROP POLICY IF EXISTS "Catalog media authorized update" ON storage.objects;
CREATE POLICY "Catalog media authorized update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'catalog-media'
    AND EXISTS (
      SELECT 1
      FROM public.catalog_items item
      WHERE ('account-' || item.account_id::TEXT)
              = (storage.foldername(name))[1]
        AND item.id::TEXT = (storage.foldername(name))[3]
        AND public.catalog_can_manage_item(item.id)
    )
  )
  WITH CHECK (
    bucket_id = 'catalog-media'
    AND (storage.foldername(name))[2] = 'vehicles'
    AND array_length(storage.foldername(name), 1) = 3
    AND EXISTS (
      SELECT 1
      FROM public.catalog_items item
      WHERE ('account-' || item.account_id::TEXT)
              = (storage.foldername(name))[1]
        AND item.id::TEXT = (storage.foldername(name))[3]
        AND public.catalog_can_manage_item(item.id)
    )
  );

DROP POLICY IF EXISTS "Catalog media authorized delete" ON storage.objects;
CREATE POLICY "Catalog media authorized delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'catalog-media'
    AND EXISTS (
      SELECT 1
      FROM public.catalog_items item
      WHERE ('account-' || item.account_id::TEXT)
              = (storage.foldername(name))[1]
        AND item.id::TEXT = (storage.foldername(name))[3]
        AND public.catalog_can_manage_item(item.id)
    )
  );

-- ============================================================================
-- 12. REALTIME AND POSTGREST
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'catalog_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.catalog_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'catalog_approvals'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.catalog_approvals;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
