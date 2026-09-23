-- Only the platform owner can directly maintain the global support corpus.
-- Server routes additionally enforce this boundary before using service_role.

DROP POLICY IF EXISTS platform_support_documents_staff
  ON public.platform_support_documents;
DROP POLICY IF EXISTS platform_support_documents_owner
  ON public.platform_support_documents;
CREATE POLICY platform_support_documents_owner
  ON public.platform_support_documents FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid(), 'platform_owner'))
  WITH CHECK (public.is_platform_admin(auth.uid(), 'platform_owner'));

DROP POLICY IF EXISTS platform_support_chunks_staff
  ON public.platform_support_chunks;
DROP POLICY IF EXISTS platform_support_chunks_owner
  ON public.platform_support_chunks;
CREATE POLICY platform_support_chunks_owner
  ON public.platform_support_chunks FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid(), 'platform_owner'))
  WITH CHECK (public.is_platform_admin(auth.uid(), 'platform_owner'));

NOTIFY pgrst, 'reload schema';
