-- ============================================================================
-- NEXORA CATALOG — SAFE IMAGE ORDER FOR EXISTING GALLERIES
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_catalog_image_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.catalog_item_images image
    WHERE image.catalog_item_id = NEW.catalog_item_id
      AND image.sort_order = NEW.sort_order
  ) THEN
    SELECT COALESCE(MAX(image.sort_order) + 1, 0)
    INTO NEW.sort_order
    FROM public.catalog_item_images image
    WHERE image.catalog_item_id = NEW.catalog_item_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_item_images image
    WHERE image.catalog_item_id = NEW.catalog_item_id
  ) THEN
    NEW.is_primary := TRUE;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.normalize_catalog_image_insert() OWNER TO postgres;

DROP TRIGGER IF EXISTS normalize_catalog_image_insert
  ON public.catalog_item_images;
CREATE TRIGGER normalize_catalog_image_insert
  BEFORE INSERT ON public.catalog_item_images
  FOR EACH ROW EXECUTE FUNCTION public.normalize_catalog_image_insert();

COMMIT;
