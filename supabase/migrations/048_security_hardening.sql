-- ============================================================
-- RPC permission hardening and AI knowledge tenant isolation.
--
-- Supabase grants EXECUTE on newly-created functions to API roles
-- through default privileges. REVOKE FROM PUBLIC alone does not
-- remove those explicit `anon` / `authenticated` grants, so several
-- internal SECURITY DEFINER helpers remained callable through RPC.
--
-- This migration:
--   * makes future public-schema functions closed by default;
--   * removes API-role grants from every application-owned function;
--   * restores only the minimum grants used by the application;
--   * adds an account-membership guard to both AI retrieval RPCs.
--
-- Apply after 047_social_channel_plan_limit.sql.
-- ============================================================

SET search_path = public, pg_catalog;

-- Future functions must opt in to API exposure explicitly. Keep
-- service_role's Supabase-managed default; it is the server-only role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Reset all application-owned public functions to a deterministic
-- baseline. Extension-owned functions (for example pgvector) are left
-- untouched. Trigger functions continue to run from their existing
-- triggers; they do not need direct API execution grants.
DO $$
DECLARE
  function_signature TEXT;
BEGIN
  FOR function_signature IN
    SELECT p.oid::regprocedure::TEXT
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      function_signature
    );
  END LOOP;
END;
$$;

-- ============================================================
-- AI knowledge retrieval.
--
-- Authenticated callers may only search their own active account.
-- The auto-reply engine uses service_role and is allowed to search
-- the account explicitly supplied by its trusted server context.
-- Clamp match_count so direct RPC calls cannot request unbounded rows.
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_fts(
  p_account_id UUID,
  p_query TEXT,
  p_match_count INTEGER
)
RETURNS TABLE (id UUID, content TEXT, rank REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    c.id,
    c.content,
    ts_rank(c.fts, plainto_tsquery('simple', p_query)) AS rank
  FROM public.ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND (
      auth.role() = 'service_role'
      OR public.is_account_member(p_account_id)
    )
    AND c.fts @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(COALESCE(p_match_count, 0), 0), 20);
$$;

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_semantic(
  p_account_id UUID,
  p_query_embedding TEXT,
  p_match_count INTEGER
)
RETURNS TABLE (id UUID, content TEXT, distance REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    c.id,
    c.content,
    (c.embedding <=> p_query_embedding::vector(1536)) AS distance
  FROM public.ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND (
      auth.role() = 'service_role'
      OR public.is_account_member(p_account_id)
    )
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding::vector(1536)
  LIMIT LEAST(GREATEST(COALESCE(p_match_count, 0), 0), 20);
$$;

-- ============================================================
-- Deliberately public-before-login RPC.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.peek_invitation(TEXT)
  TO anon, authenticated;

-- ============================================================
-- Authenticated user RPCs.
-- Each mutating SECURITY DEFINER function performs its own auth.uid()
-- and account/role checks before changing data.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, account_role_enum)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_account_member(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_account_ownership(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_presence(TEXT)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.filter_contacts_by_tags(
  UUID[], TEXT, INTEGER, INTEGER
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_ticket_analytics(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, UUID, UUID
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.accept_ticket(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ticket(UUID, UUID, UUID, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ticket_status(UUID, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ticket_department(UUID, UUID, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_ticket_read(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_ticket(UUID, TEXT, UUID[])
  TO authenticated;

-- RLS helpers are invoked by authenticated table queries. service_role
-- is included for trusted server paths and nested helper calls.
GRANT EXECUTE ON FUNCTION public.account_has_operational_access(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_account_profile_member(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_account_member(UUID, account_role_enum)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(UUID, platform_role_enum)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_account_role(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_department_member(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_department_supervisor(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_ticket(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_operate_ticket(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_ticket(UUID, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_contact(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_operate_contact_tag(UUID)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_fts(
  UUID, TEXT, INTEGER
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_semantic(
  UUID, TEXT, INTEGER
) TO authenticated, service_role;

-- ============================================================
-- Server-only RPCs.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.claim_ai_reply_slot(UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ticket_automation_events(INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_automation_execution_count(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_flow_execution_count(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_account_overview()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_account_member(
  UUID, UUID, account_role_enum, UUID[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_webhook_failure(UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_broadcast_counts(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_contacts()
  TO service_role;

NOTIFY pgrst, 'reload schema';
