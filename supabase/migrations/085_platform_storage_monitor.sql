-- Nexora platform storage monitor.
-- Global totals are exact. Per-account database values are estimates based on
-- row payload size; Storage attribution is exact for account-scoped paths.

CREATE TABLE IF NOT EXISTS public.platform_storage_settings (
  singleton_id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  database_capacity_bytes   BIGINT NOT NULL DEFAULT 524288000
                            CHECK (database_capacity_bytes BETWEEN 10485760 AND 10995116277760),
  storage_capacity_bytes    BIGINT NOT NULL DEFAULT 1073741824
                            CHECK (storage_capacity_bytes BETWEEN 10485760 AND 10995116277760),
  thresholds                SMALLINT[] NOT NULL DEFAULT ARRAY[60, 80, 90]::SMALLINT[],
  updated_by_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_storage_thresholds_valid CHECK (
    thresholds = ARRAY[60, 80, 90]::SMALLINT[]
  )
);

INSERT INTO public.platform_storage_settings (singleton_id)
VALUES (1)
ON CONFLICT (singleton_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_storage_snapshots (
  id                       UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  database_bytes           BIGINT NOT NULL CHECK (database_bytes >= 0),
  storage_bytes            BIGINT NOT NULL CHECK (storage_bytes >= 0),
  database_capacity_bytes  BIGINT NOT NULL CHECK (database_capacity_bytes > 0),
  storage_capacity_bytes   BIGINT NOT NULL CHECK (storage_capacity_bytes > 0),
  database_percent         NUMERIC(7, 3) NOT NULL CHECK (database_percent >= 0),
  storage_percent          NUMERIC(7, 3) NOT NULL CHECK (storage_percent >= 0),
  breakdown                JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_storage_snapshots_created
  ON public.platform_storage_snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_storage_alerts (
  id                       UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  resource_type            TEXT NOT NULL CHECK (resource_type IN ('database', 'storage')),
  threshold                SMALLINT NOT NULL CHECK (threshold IN (60, 80, 90)),
  status                   TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'resolved')),
  usage_bytes              BIGINT NOT NULL CHECK (usage_bytes >= 0),
  capacity_bytes           BIGINT NOT NULL CHECK (capacity_bytes > 0),
  usage_percent            NUMERIC(7, 3) NOT NULL CHECK (usage_percent >= 0),
  top_account_id           UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  top_account_name         TEXT,
  top_module               TEXT,
  details                  JSONB NOT NULL DEFAULT '{}'::JSONB,
  first_triggered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at          TIMESTAMPTZ,
  acknowledged_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at              TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_storage_alert_active_unique
  ON public.platform_storage_alerts(resource_type, threshold)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_platform_storage_alerts_recent
  ON public.platform_storage_alerts(status, first_triggered_at DESC);

ALTER TABLE public.platform_storage_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_storage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_storage_alerts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_storage_settings FROM anon, authenticated;
REVOKE ALL ON public.platform_storage_snapshots FROM anon, authenticated;
REVOKE ALL ON public.platform_storage_alerts FROM anon, authenticated;
GRANT ALL ON public.platform_storage_settings TO service_role;
GRANT ALL ON public.platform_storage_snapshots TO service_role;
GRANT ALL ON public.platform_storage_alerts TO service_role;

CREATE OR REPLACE FUNCTION public.platform_storage_totals()
RETURNS TABLE (
  database_bytes BIGINT,
  storage_bytes BIGINT,
  storage_files BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, storage, pg_catalog
AS $$
  SELECT
    pg_database_size(current_database())::BIGINT,
    COALESCE(SUM(
      CASE
        WHEN (obj.metadata->>'size') ~ '^[0-9]+$'
          THEN (obj.metadata->>'size')::BIGINT
        ELSE 0
      END
    ), 0)::BIGINT,
    COUNT(obj.id)::BIGINT
  FROM storage.objects obj;
$$;

CREATE OR REPLACE FUNCTION public.platform_storage_module_usage()
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  module TEXT,
  database_bytes BIGINT,
  storage_bytes BIGINT,
  file_count BIGINT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, storage, pg_catalog
AS $$
  WITH database_usage AS (
    SELECT c.account_id, 'contactos'::TEXT AS module,
           COALESCE(SUM(pg_column_size(to_jsonb(c))), 0)::BIGINT AS bytes
    FROM public.contacts c GROUP BY c.account_id
    UNION ALL
    SELECT c.account_id, 'conversaciones',
           COALESCE(SUM(pg_column_size(to_jsonb(c))), 0)::BIGINT
    FROM public.conversations c GROUP BY c.account_id
    UNION ALL
    SELECT c.account_id, 'conversaciones',
           COALESCE(SUM(pg_column_size(to_jsonb(m))), 0)::BIGINT
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    GROUP BY c.account_id
    UNION ALL
    SELECT q.account_id, 'cotizaciones',
           COALESCE(SUM(pg_column_size(to_jsonb(q))), 0)::BIGINT
    FROM public.quotations q GROUP BY q.account_id
    UNION ALL
    SELECT qv.account_id, 'cotizaciones',
           COALESCE(SUM(pg_column_size(to_jsonb(qv))), 0)::BIGINT
    FROM public.quotation_versions qv GROUP BY qv.account_id
    UNION ALL
    SELECT c.account_id, 'contratos',
           COALESCE(SUM(pg_column_size(to_jsonb(c))), 0)::BIGINT
    FROM public.contracts c GROUP BY c.account_id
    UNION ALL
    SELECT cv.account_id, 'contratos',
           COALESCE(SUM(pg_column_size(to_jsonb(cv))), 0)::BIGINT
    FROM public.contract_versions cv GROUP BY cv.account_id
    UNION ALL
    SELECT ci.account_id, 'catalogo',
           COALESCE(SUM(pg_column_size(to_jsonb(ci))), 0)::BIGINT
    FROM public.catalog_items ci GROUP BY ci.account_id
    UNION ALL
    SELECT cvd.account_id, 'catalogo',
           COALESCE(SUM(pg_column_size(to_jsonb(cvd))), 0)::BIGINT
    FROM public.catalog_vehicle_details cvd GROUP BY cvd.account_id
    UNION ALL
    SELECT cii.account_id, 'catalogo',
           COALESCE(SUM(pg_column_size(to_jsonb(cii))), 0)::BIGINT
    FROM public.catalog_item_images cii GROUP BY cii.account_id
  ),
  database_grouped AS (
    SELECT du.account_id, du.module, SUM(du.bytes)::BIGINT AS bytes
    FROM database_usage du
    WHERE du.account_id IS NOT NULL
    GROUP BY du.account_id, du.module
  ),
  storage_paths AS (
    SELECT
      obj.bucket_id,
      obj.name,
      CASE
        WHEN obj.name ~ '^account-[0-9a-fA-F-]{36}/'
          THEN substring(obj.name FROM '^account-([0-9a-fA-F-]{36})/')::UUID
        WHEN obj.bucket_id = 'company-logos'
             AND obj.name ~ '^[0-9a-fA-F-]{36}/'
          THEN substring(obj.name FROM '^([0-9a-fA-F-]{36})/')::UUID
        WHEN obj.bucket_id = 'avatars'
             AND obj.name ~ '^[0-9a-fA-F-]{36}/'
          THEN p.account_id
        ELSE NULL
      END AS account_id,
      CASE obj.bucket_id
        WHEN 'quotation-documents' THEN 'cotizaciones'
        WHEN 'contract-documents' THEN 'contratos'
        WHEN 'catalog-media' THEN 'catalogo'
        WHEN 'chat-media' THEN 'conversaciones'
        WHEN 'flow-media' THEN 'automatizaciones'
        WHEN 'company-logos' THEN 'empresa'
        WHEN 'avatars' THEN 'usuarios'
        ELSE 'otros'
      END AS module,
      CASE
        WHEN (obj.metadata->>'size') ~ '^[0-9]+$'
          THEN (obj.metadata->>'size')::BIGINT
        ELSE 0
      END AS bytes
    FROM storage.objects obj
    LEFT JOIN public.profiles p
      ON obj.bucket_id = 'avatars'
     AND obj.name ~ '^[0-9a-fA-F-]{36}/'
     AND p.user_id = substring(obj.name FROM '^([0-9a-fA-F-]{36})/')::UUID
  ),
  storage_grouped AS (
    SELECT sp.account_id, sp.module, SUM(sp.bytes)::BIGINT AS bytes,
           COUNT(*)::BIGINT AS files
    FROM storage_paths sp
    WHERE sp.account_id IS NOT NULL
    GROUP BY sp.account_id, sp.module
  ),
  keys AS (
    SELECT dg.account_id, dg.module FROM database_grouped dg
    UNION
    SELECT sg.account_id, sg.module FROM storage_grouped sg
  )
  SELECT
    k.account_id,
    a.name::TEXT,
    k.module,
    COALESCE(dg.bytes, 0)::BIGINT,
    COALESCE(sg.bytes, 0)::BIGINT,
    COALESCE(sg.files, 0)::BIGINT
  FROM keys k
  JOIN public.accounts a ON a.id = k.account_id
  LEFT JOIN database_grouped dg
    ON dg.account_id = k.account_id AND dg.module = k.module
  LEFT JOIN storage_grouped sg
    ON sg.account_id = k.account_id AND sg.module = k.module
  ORDER BY COALESCE(dg.bytes, 0) + COALESCE(sg.bytes, 0) DESC;
$$;

REVOKE ALL ON FUNCTION public.platform_storage_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_storage_module_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_storage_totals() TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_storage_module_usage() TO service_role;

NOTIFY pgrst, 'reload schema';
