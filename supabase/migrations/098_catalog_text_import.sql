-- Catalog imports are useful before vehicle photography is ready. Owners and
-- administrators can publish those rows immediately as a shareable text
-- catalog; lower roles keep the existing approval boundary.

BEGIN;

CREATE OR REPLACE FUNCTION public.import_catalog_text_vehicle(
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
  v_snapshot JSONB;
BEGIN
  SELECT profile.account_id, profile.account_role::TEXT
  INTO v_account_id, v_role
  FROM public.profiles profile
  WHERE profile.user_id = auth.uid()
  LIMIT 1;

  IF v_account_id IS NULL OR v_role NOT IN (
    'owner', 'admin', 'supervisor', 'agent'
  ) THEN
    RAISE EXCEPTION 'catalog_import_forbidden' USING ERRCODE = '42501';
  END IF;

  v_item_id := public.create_catalog_vehicle(
    p_payload,
    p_confirm_possible_duplicate
  );

  IF v_role IN ('owner', 'admin') THEN
    UPDATE public.catalog_items
    SET
      status = 'available',
      visibility = 'shareable',
      approved_by_user_id = auth.uid(),
      approved_at = NOW(),
      updated_by_user_id = auth.uid()
    WHERE id = v_item_id
      AND account_id = v_account_id;
  ELSE
    SELECT jsonb_build_object(
      'item', to_jsonb(item),
      'vehicle', to_jsonb(detail),
      'images', '[]'::jsonb,
      'import_mode', 'text_catalog'
    )
    INTO v_snapshot
    FROM public.catalog_items item
    JOIN public.catalog_vehicle_details detail ON detail.item_id = item.id
    WHERE item.id = v_item_id
      AND item.account_id = v_account_id;

    UPDATE public.catalog_items
    SET
      status = 'pending_approval',
      submitted_at = NOW(),
      updated_by_user_id = auth.uid()
    WHERE id = v_item_id
      AND account_id = v_account_id;

    INSERT INTO public.catalog_approvals (
      account_id,
      catalog_item_id,
      status,
      requested_by_user_id,
      request_snapshot
    ) VALUES (
      v_account_id,
      v_item_id,
      'pending',
      auth.uid(),
      v_snapshot
    );
  END IF;

  RETURN v_item_id;
END;
$$;

ALTER FUNCTION public.import_catalog_text_vehicle(JSONB, BOOLEAN)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.import_catalog_text_vehicle(JSONB, BOOLEAN)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_catalog_text_vehicle(JSONB, BOOLEAN)
  TO authenticated;

COMMENT ON FUNCTION public.import_catalog_text_vehicle(JSONB, BOOLEAN) IS
  'Imports a vehicle as a text-first catalog entry. Admins publish immediately; other catalog editors submit it for approval.';

COMMIT;
