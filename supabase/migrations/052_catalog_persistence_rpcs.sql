-- ============================================================================
-- NEXORA CATALOG — TRANSACTIONAL PERSISTENCE RPCS
-- ============================================================================

BEGIN;

SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.create_catalog_vehicle(
  p_payload JSONB,
  p_confirm_possible_duplicate BOOLEAN DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_account_id UUID;
  v_role TEXT;
  v_item_id UUID;
  v_plate_normalized TEXT;
  v_title TEXT;
BEGIN
  SELECT profile.account_id, profile.account_role::TEXT
  INTO v_account_id, v_role
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
  LIMIT 1;

  IF v_account_id IS NULL OR v_role NOT IN (
    'owner', 'admin', 'supervisor', 'agent'
  ) THEN
    RAISE EXCEPTION 'catalog_create_forbidden' USING ERRCODE = '42501';
  END IF;

  v_plate_normalized := upper(
    regexp_replace(
      COALESCE(p_payload ->> 'license_plate', ''),
      '[^A-Za-z0-9]',
      '',
      'g'
    )
  );

  IF v_plate_normalized <> ''
     AND NOT p_confirm_possible_duplicate
     AND EXISTS (
       SELECT 1
       FROM public.catalog_vehicle_details detail
       WHERE detail.account_id = v_account_id
         AND detail.license_plate_normalized = v_plate_normalized
     ) THEN
    RAISE EXCEPTION 'catalog_possible_duplicate'
      USING
        ERRCODE = 'P0001',
        DETAIL = 'A vehicle with the same normalized plate already exists.';
  END IF;

  v_title := concat_ws(
    ' ',
    NULLIF(trim(p_payload ->> 'make'), ''),
    NULLIF(trim(p_payload ->> 'model'), ''),
    NULLIF(trim(p_payload ->> 'model_year'), '')
  );

  INSERT INTO public.catalog_items (
    account_id,
    item_type,
    internal_code,
    title,
    description,
    status,
    visibility,
    created_by_user_id,
    updated_by_user_id
  ) VALUES (
    v_account_id,
    'vehicle',
    trim(p_payload ->> 'internal_code'),
    v_title,
    COALESCE(p_payload ->> 'description', ''),
    'draft',
    'internal',
    auth.uid(),
    auth.uid()
  )
  RETURNING id INTO v_item_id;

  INSERT INTO public.catalog_vehicle_details (
    item_id,
    account_id,
    license_plate,
    license_plate_visible,
    make,
    model,
    version,
    model_year,
    color,
    engine,
    fuel,
    transmission,
    drivetrain,
    mileage_km,
    list_price,
    offer_price,
    minimum_down_payment,
    financing_text,
    technical_review_expires_on,
    circulation_permit_expires_on,
    current_location,
    location_description,
    updated_by_user_id
  ) VALUES (
    v_item_id,
    v_account_id,
    NULLIF(trim(p_payload ->> 'license_plate'), ''),
    COALESCE((p_payload ->> 'license_plate_visible')::BOOLEAN, FALSE),
    trim(p_payload ->> 'make'),
    trim(p_payload ->> 'model'),
    COALESCE(p_payload ->> 'version', ''),
    (p_payload ->> 'model_year')::SMALLINT,
    COALESCE(p_payload ->> 'color', ''),
    COALESCE(p_payload ->> 'engine', ''),
    COALESCE(NULLIF(p_payload ->> 'fuel', ''), 'other'),
    COALESCE(NULLIF(p_payload ->> 'transmission', ''), 'other'),
    COALESCE(NULLIF(p_payload ->> 'drivetrain', ''), 'other'),
    COALESCE((NULLIF(p_payload ->> 'mileage_km', ''))::BIGINT, 0),
    (p_payload ->> 'list_price')::NUMERIC,
    (NULLIF(p_payload ->> 'offer_price', ''))::NUMERIC,
    (NULLIF(p_payload ->> 'minimum_down_payment', ''))::NUMERIC,
    COALESCE(p_payload ->> 'financing_text', ''),
    (NULLIF(p_payload ->> 'technical_review_expires_on', ''))::DATE,
    (NULLIF(p_payload ->> 'circulation_permit_expires_on', ''))::DATE,
    COALESCE(p_payload ->> 'current_location', ''),
    COALESCE(p_payload ->> 'location_description', ''),
    auth.uid()
  );

  RETURN v_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_catalog_vehicle(
  p_catalog_item_id UUID,
  p_payload JSONB,
  p_confirm_possible_duplicate BOOLEAN DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_item public.catalog_items%ROWTYPE;
  v_plate_normalized TEXT;
  v_title TEXT;
BEGIN
  SELECT *
  INTO v_item
  FROM public.catalog_items
  WHERE id = p_catalog_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.catalog_can_manage_item(v_item.id) THEN
    RAISE EXCEPTION 'catalog_update_forbidden' USING ERRCODE = '42501';
  END IF;

  v_plate_normalized := upper(
    regexp_replace(
      COALESCE(p_payload ->> 'license_plate', ''),
      '[^A-Za-z0-9]',
      '',
      'g'
    )
  );

  IF v_plate_normalized <> ''
     AND NOT p_confirm_possible_duplicate
     AND EXISTS (
       SELECT 1
       FROM public.catalog_vehicle_details detail
       WHERE detail.account_id = v_item.account_id
         AND detail.item_id <> v_item.id
         AND detail.license_plate_normalized = v_plate_normalized
     ) THEN
    RAISE EXCEPTION 'catalog_possible_duplicate'
      USING
        ERRCODE = 'P0001',
        DETAIL = 'A vehicle with the same normalized plate already exists.';
  END IF;

  v_title := concat_ws(
    ' ',
    NULLIF(trim(p_payload ->> 'make'), ''),
    NULLIF(trim(p_payload ->> 'model'), ''),
    NULLIF(trim(p_payload ->> 'model_year'), '')
  );

  UPDATE public.catalog_items
  SET
    internal_code = trim(p_payload ->> 'internal_code'),
    title = v_title,
    description = COALESCE(p_payload ->> 'description', ''),
    updated_by_user_id = auth.uid()
  WHERE id = v_item.id;

  UPDATE public.catalog_vehicle_details
  SET
    license_plate = NULLIF(trim(p_payload ->> 'license_plate'), ''),
    license_plate_visible =
      COALESCE((p_payload ->> 'license_plate_visible')::BOOLEAN, FALSE),
    make = trim(p_payload ->> 'make'),
    model = trim(p_payload ->> 'model'),
    version = COALESCE(p_payload ->> 'version', ''),
    model_year = (p_payload ->> 'model_year')::SMALLINT,
    color = COALESCE(p_payload ->> 'color', ''),
    engine = COALESCE(p_payload ->> 'engine', ''),
    fuel = COALESCE(NULLIF(p_payload ->> 'fuel', ''), 'other'),
    transmission =
      COALESCE(NULLIF(p_payload ->> 'transmission', ''), 'other'),
    drivetrain = COALESCE(NULLIF(p_payload ->> 'drivetrain', ''), 'other'),
    mileage_km =
      COALESCE((NULLIF(p_payload ->> 'mileage_km', ''))::BIGINT, 0),
    list_price = (p_payload ->> 'list_price')::NUMERIC,
    offer_price = (NULLIF(p_payload ->> 'offer_price', ''))::NUMERIC,
    minimum_down_payment =
      (NULLIF(p_payload ->> 'minimum_down_payment', ''))::NUMERIC,
    financing_text = COALESCE(p_payload ->> 'financing_text', ''),
    technical_review_expires_on =
      (NULLIF(p_payload ->> 'technical_review_expires_on', ''))::DATE,
    circulation_permit_expires_on =
      (NULLIF(p_payload ->> 'circulation_permit_expires_on', ''))::DATE,
    current_location = COALESCE(p_payload ->> 'current_location', ''),
    location_description =
      COALESCE(p_payload ->> 'location_description', ''),
    updated_by_user_id = auth.uid()
  WHERE item_id = v_item.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog_vehicle_details_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_item.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_catalog_item_image(
  p_catalog_item_id UUID,
  p_image_id UUID,
  p_storage_path TEXT,
  p_mime_type TEXT,
  p_byte_size BIGINT,
  p_width INTEGER DEFAULT NULL,
  p_height INTEGER DEFAULT NULL,
  p_alt_text TEXT DEFAULT '',
  p_sort_order INTEGER DEFAULT 0,
  p_is_primary BOOLEAN DEFAULT FALSE
) RETURNS public.catalog_item_images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_item public.catalog_items%ROWTYPE;
  v_image public.catalog_item_images%ROWTYPE;
  v_required_prefix TEXT;
  v_make_primary BOOLEAN;
BEGIN
  SELECT *
  INTO v_item
  FROM public.catalog_items
  WHERE id = p_catalog_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.catalog_can_manage_item(v_item.id) THEN
    RAISE EXCEPTION 'catalog_image_forbidden' USING ERRCODE = '42501';
  END IF;

  v_required_prefix :=
    'account-' || v_item.account_id::TEXT
    || '/vehicles/' || v_item.id::TEXT
    || '/' || p_image_id::TEXT || '.';

  IF p_storage_path NOT LIKE (v_required_prefix || '%') THEN
    RAISE EXCEPTION 'catalog_image_path_invalid' USING ERRCODE = '22023';
  END IF;

  v_make_primary := p_is_primary OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_item_images image
    WHERE image.catalog_item_id = v_item.id
  );

  IF v_make_primary THEN
    UPDATE public.catalog_item_images
    SET is_primary = FALSE
    WHERE catalog_item_id = v_item.id
      AND is_primary;
  END IF;

  INSERT INTO public.catalog_item_images (
    id,
    account_id,
    catalog_item_id,
    storage_path,
    mime_type,
    byte_size,
    width,
    height,
    alt_text,
    sort_order,
    is_primary,
    uploaded_by_user_id
  ) VALUES (
    p_image_id,
    v_item.account_id,
    v_item.id,
    p_storage_path,
    p_mime_type,
    p_byte_size,
    p_width,
    p_height,
    COALESCE(p_alt_text, ''),
    p_sort_order,
    v_make_primary,
    auth.uid()
  )
  RETURNING * INTO v_image;

  RETURN v_image;
END;
$$;

ALTER FUNCTION public.create_catalog_vehicle(JSONB, BOOLEAN) OWNER TO postgres;
ALTER FUNCTION public.update_catalog_vehicle(UUID, JSONB, BOOLEAN)
  OWNER TO postgres;
ALTER FUNCTION public.register_catalog_item_image(
  UUID,
  UUID,
  TEXT,
  TEXT,
  BIGINT,
  INTEGER,
  INTEGER,
  TEXT,
  INTEGER,
  BOOLEAN
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_catalog_vehicle(JSONB, BOOLEAN)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_catalog_vehicle(UUID, JSONB, BOOLEAN)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_catalog_item_image(
  UUID,
  UUID,
  TEXT,
  TEXT,
  BIGINT,
  INTEGER,
  INTEGER,
  TEXT,
  INTEGER,
  BOOLEAN
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_catalog_vehicle(JSONB, BOOLEAN)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_catalog_vehicle(UUID, JSONB, BOOLEAN)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_catalog_item_image(
  UUID,
  UUID,
  TEXT,
  TEXT,
  BIGINT,
  INTEGER,
  INTEGER,
  TEXT,
  INTEGER,
  BOOLEAN
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
