-- Permanent catalog deletion for account owners and administrators.
-- Quotations and contracts keep their immutable snapshots; their catalog_item_id
-- foreign keys are already configured with ON DELETE SET NULL.

CREATE OR REPLACE FUNCTION public.delete_catalog_vehicle(
  p_catalog_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_item public.catalog_items%ROWTYPE;
  v_role TEXT;
  v_storage_paths TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT item.*
  INTO v_item
  FROM public.catalog_items item
  WHERE item.id = p_catalog_item_id
    AND item.item_type = 'vehicle'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog_vehicle_not_found';
  END IF;

  v_role := public.current_account_role(v_item.account_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'catalog_vehicle_delete_forbidden';
  END IF;

  SELECT COALESCE(array_agg(image.storage_path ORDER BY image.sort_order), ARRAY[]::TEXT[])
  INTO v_storage_paths
  FROM public.catalog_item_images image
  WHERE image.account_id = v_item.account_id
    AND image.catalog_item_id = v_item.id;

  -- Delete restrictive dependants while the catalog item still exists. Image
  -- deletion emits an audit row, so activity must deliberately be cleared last.
  DELETE FROM public.contact_catalog_interests
  WHERE account_id = v_item.account_id
    AND catalog_item_id = v_item.id;

  DELETE FROM public.catalog_item_shares
  WHERE account_id = v_item.account_id
    AND catalog_item_id = v_item.id;

  DELETE FROM public.catalog_approvals
  WHERE account_id = v_item.account_id
    AND catalog_item_id = v_item.id;

  DELETE FROM public.catalog_item_images
  WHERE account_id = v_item.account_id
    AND catalog_item_id = v_item.id;

  DELETE FROM public.catalog_item_activity
  WHERE account_id = v_item.account_id
    AND catalog_item_id = v_item.id;

  DELETE FROM public.catalog_items
  WHERE id = v_item.id
    AND account_id = v_item.account_id;

  RETURN jsonb_build_object(
    'id', v_item.id,
    'storagePaths', to_jsonb(v_storage_paths)
  );
END;
$$;

ALTER FUNCTION public.delete_catalog_vehicle(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_catalog_vehicle(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_catalog_vehicle(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_catalog_vehicle(UUID) TO service_role;
