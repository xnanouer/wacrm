-- Persist the document design selected by the executive for each quotation.
-- The v2 RPC wrappers keep the existing quotation validation and numbering
-- transaction intact while saving the template in the same database call.

SET search_path = public, pg_catalog;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS document_template TEXT NOT NULL DEFAULT 'classic';

ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_document_template_check;

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_document_template_check
  CHECK (document_template IN ('classic', 'showcase'));

CREATE OR REPLACE FUNCTION public.create_vehicle_quotation_v2(p_payload JSONB)
RETURNS public.quotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
BEGIN
  v_quote := public.create_vehicle_quotation(p_payload);

  UPDATE public.quotations
  SET document_template = CASE
    WHEN p_payload->>'document_template' = 'showcase' THEN 'showcase'
    ELSE 'classic'
  END
  WHERE id = v_quote.id
  RETURNING * INTO v_quote;

  RETURN v_quote;
END;
$$;

ALTER FUNCTION public.create_vehicle_quotation_v2(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_vehicle_quotation_v2(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_vehicle_quotation_v2(JSONB)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_vehicle_quotation_v2(
  p_quotation_id UUID,
  p_payload JSONB
) RETURNS public.quotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
BEGIN
  v_quote := public.update_vehicle_quotation(p_quotation_id, p_payload);

  UPDATE public.quotations
  SET document_template = CASE
    WHEN p_payload->>'document_template' = 'showcase' THEN 'showcase'
    ELSE 'classic'
  END
  WHERE id = v_quote.id
  RETURNING * INTO v_quote;

  RETURN v_quote;
END;
$$;

ALTER FUNCTION public.update_vehicle_quotation_v2(UUID, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_vehicle_quotation_v2(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_vehicle_quotation_v2(UUID, JSONB)
  TO authenticated;
