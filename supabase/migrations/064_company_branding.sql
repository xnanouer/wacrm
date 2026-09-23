-- ============================================================
-- 064_company_branding.sql
-- Company logo metadata and isolated logo storage.
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_logo_url_length_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_logo_url_length_check
  CHECK (logo_url IS NULL OR length(logo_url) <= 2000);

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'company-logos',
  'company-logos',
  TRUE,
  3145728,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Company logos are publicly readable" ON storage.objects;
CREATE POLICY "Company logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

DROP POLICY IF EXISTS "Company admins can upload logos" ON storage.objects;
CREATE POLICY "Company admins can upload logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.account_id::TEXT = (storage.foldername(name))[1]
        AND profile.account_role::TEXT IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Company admins can update logos" ON storage.objects;
CREATE POLICY "Company admins can update logos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.account_id::TEXT = (storage.foldername(name))[1]
        AND profile.account_role::TEXT IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.account_id::TEXT = (storage.foldername(name))[1]
        AND profile.account_role::TEXT IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Company admins can delete logos" ON storage.objects;
CREATE POLICY "Company admins can delete logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.account_id::TEXT = (storage.foldername(name))[1]
        AND profile.account_role::TEXT IN ('owner', 'admin')
    )
  );

COMMENT ON COLUMN public.accounts.logo_url IS
  'Public logo URL for the company workspace branding.';
