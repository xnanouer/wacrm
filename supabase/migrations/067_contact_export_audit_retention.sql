-- ============================================================
-- 067 — Keep export audits without blocking member deletion
--
-- An administrator may leave the company after exporting data. Preserve the
-- audit event, but do not let that historical row prevent the account owner
-- from removing the former user from Supabase Auth.
-- ============================================================

SET search_path = public, pg_catalog;

ALTER TABLE public.contact_export_logs
  ALTER COLUMN exported_by_user_id DROP NOT NULL;

ALTER TABLE public.contact_export_logs
  DROP CONSTRAINT IF EXISTS contact_export_logs_exported_by_user_id_fkey;

ALTER TABLE public.contact_export_logs
  ADD CONSTRAINT contact_export_logs_exported_by_user_id_fkey
  FOREIGN KEY (exported_by_user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.contact_export_logs.exported_by_user_id IS
  'Administrator who generated the export; null only if that auth user was later deleted.';

NOTIFY pgrst, 'reload schema';
