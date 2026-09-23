-- ============================================================
-- 068_platform_presence_support.sql
-- Global platform presence and official Nexora support foundation.
-- This data is intentionally separate from tenant commercial AI data.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Global presence is deliberately not exposed to normal authenticated reads.
CREATE TABLE IF NOT EXISTS public.platform_user_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL CHECK (length(session_id) BETWEEN 8 AND 160),
  current_path TEXT NOT NULL DEFAULT '/dashboard'
    CHECK (length(current_path) BETWEEN 1 AND 300),
  device_type TEXT NOT NULL DEFAULT 'desktop'
    CHECK (device_type IN ('desktop', 'mobile')),
  signed_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_presence_last_seen
  ON public.platform_user_presence(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_presence_account_last_seen
  ON public.platform_user_presence(account_id, last_seen_at DESC);

ALTER TABLE public.platform_user_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_user_presence FROM anon, authenticated;
GRANT INSERT, UPDATE ON public.platform_user_presence TO authenticated;
GRANT ALL ON public.platform_user_presence TO service_role;

DROP POLICY IF EXISTS platform_presence_insert_self
  ON public.platform_user_presence;
CREATE POLICY platform_presence_insert_self
  ON public.platform_user_presence FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.account_id = platform_user_presence.account_id
    )
  );

DROP POLICY IF EXISTS platform_presence_update_self
  ON public.platform_user_presence;
CREATE POLICY platform_presence_update_self
  ON public.platform_user_presence FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.account_id = platform_user_presence.account_id
    )
  );

CREATE OR REPLACE FUNCTION public.touch_platform_presence(
  p_session_id TEXT,
  p_current_path TEXT DEFAULT '/dashboard',
  p_device_type TEXT DEFAULT 'desktop'
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_path TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR length(p_session_id) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Invalid session id' USING ERRCODE = '22023';
  END IF;
  IF p_device_type NOT IN ('desktop', 'mobile') THEN
    RAISE EXCEPTION 'Invalid device type' USING ERRCODE = '22023';
  END IF;

  SELECT account_id INTO v_account_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No account for caller' USING ERRCODE = '22023';
  END IF;

  v_path := CASE
    WHEN p_current_path ~ '^/[a-zA-Z0-9_?&=/%.-]*$'
      THEN left(p_current_path, 300)
    ELSE '/dashboard'
  END;

  INSERT INTO public.platform_user_presence (
    user_id, account_id, session_id, current_path, device_type,
    signed_in_at, last_seen_at, updated_at
  ) VALUES (
    auth.uid(), v_account_id, p_session_id, v_path, p_device_type,
    NOW(), NOW(), NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    account_id = EXCLUDED.account_id,
    session_id = EXCLUDED.session_id,
    current_path = EXCLUDED.current_path,
    device_type = EXCLUDED.device_type,
    signed_in_at = CASE
      WHEN platform_user_presence.session_id IS DISTINCT FROM EXCLUDED.session_id
        THEN NOW()
      ELSE platform_user_presence.signed_in_at
    END,
    last_seen_at = NOW(),
    updated_at = NOW();
END;
$$;

ALTER FUNCTION public.touch_platform_presence(TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.touch_platform_presence(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_platform_presence(TEXT, TEXT, TEXT)
  TO authenticated, service_role;

-- Global support knowledge. No account_id by design: only platform staff can
-- maintain it and only published documents are retrieved by the assistant.
CREATE TABLE IF NOT EXISTS public.platform_support_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 180),
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (length(trim(category)) BETWEEN 2 AND 80),
  content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 10 AND 100000),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_support_documents_status
  ON public.platform_support_documents(status, updated_at DESC);
ALTER TABLE public.platform_support_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_support_documents FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_support_documents
  TO authenticated;
GRANT ALL ON public.platform_support_documents TO service_role;

DROP POLICY IF EXISTS platform_support_documents_staff
  ON public.platform_support_documents;
CREATE POLICY platform_support_documents_staff
  ON public.platform_support_documents FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid(), 'platform_support'))
  WITH CHECK (public.is_platform_admin(auth.uid(), 'platform_admin'));

CREATE TABLE IF NOT EXISTS public.platform_support_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL
    REFERENCES public.platform_support_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  fts TSVECTOR GENERATED ALWAYS AS
    (to_tsvector('simple', content)) STORED,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_platform_support_chunks_document
  ON public.platform_support_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_platform_support_chunks_fts
  ON public.platform_support_chunks USING GIN(fts);
ALTER TABLE public.platform_support_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_support_chunks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_support_chunks
  TO authenticated;
GRANT ALL ON public.platform_support_chunks TO service_role;

DROP POLICY IF EXISTS platform_support_chunks_staff
  ON public.platform_support_chunks;
CREATE POLICY platform_support_chunks_staff
  ON public.platform_support_chunks FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid(), 'platform_support'))
  WITH CHECK (public.is_platform_admin(auth.uid(), 'platform_admin'));

CREATE OR REPLACE FUNCTION public.match_platform_support_fts(
  p_query TEXT,
  p_match_count INTEGER DEFAULT 5
) RETURNS TABLE(id UUID, document_id UUID, title TEXT, content TEXT, rank REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT chunk.id, chunk.document_id, document.title, chunk.content,
         ts_rank(chunk.fts, websearch_to_tsquery('simple', p_query))::REAL AS rank
  FROM public.platform_support_chunks chunk
  JOIN public.platform_support_documents document ON document.id = chunk.document_id
  WHERE document.status = 'published'
    AND chunk.fts @@ websearch_to_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(p_match_count, 1), 10);
$$;
ALTER FUNCTION public.match_platform_support_fts(TEXT, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.match_platform_support_fts(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_platform_support_fts(TEXT, INTEGER)
  TO service_role;

-- User-owned official support conversations.
CREATE TABLE IF NOT EXISTS public.platform_support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'escalated', 'waiting_user', 'resolved', 'closed')),
  resolution_type TEXT CHECK (
    resolution_type IS NULL OR resolution_type IN
      ('ai_resolved', 'creator_resolved', 'meeting', 'abandoned')
  ),
  current_path TEXT NOT NULL DEFAULT '/dashboard'
    CHECK (length(current_path) BETWEEN 1 AND 300),
  feedback TEXT CHECK (
    feedback IS NULL OR feedback IN ('resolved', 'partial', 'needs_support')
  ),
  escalated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_support_conversations_user
  ON public.platform_support_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_support_conversations_account
  ON public.platform_support_conversations(account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_support_conversations_status
  ON public.platform_support_conversations(status, updated_at DESC);
ALTER TABLE public.platform_support_conversations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.platform_support_conversations TO authenticated;
GRANT ALL ON public.platform_support_conversations TO service_role;

DROP POLICY IF EXISTS platform_support_conversations_select
  ON public.platform_support_conversations;
CREATE POLICY platform_support_conversations_select
  ON public.platform_support_conversations FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid(), 'platform_support')
  );
DROP POLICY IF EXISTS platform_support_conversations_insert
  ON public.platform_support_conversations;
CREATE POLICY platform_support_conversations_insert
  ON public.platform_support_conversations FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.account_id = platform_support_conversations.account_id
    )
  );
DROP POLICY IF EXISTS platform_support_conversations_update
  ON public.platform_support_conversations;
CREATE POLICY platform_support_conversations_update
  ON public.platform_support_conversations FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid(), 'platform_support')
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid(), 'platform_support')
  );

CREATE OR REPLACE FUNCTION public.guard_platform_support_conversation_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.is_platform_admin(auth.uid(), 'platform_support')
     AND (
       NEW.user_id IS DISTINCT FROM OLD.user_id OR
       NEW.account_id IS DISTINCT FROM OLD.account_id OR
       NEW.status IS DISTINCT FROM OLD.status OR
       NEW.resolution_type IS DISTINCT FROM OLD.resolution_type OR
       NEW.current_path IS DISTINCT FROM OLD.current_path OR
       NEW.escalated_at IS DISTINCT FROM OLD.escalated_at OR
       NEW.closed_at IS DISTINCT FROM OLD.closed_at OR
       NEW.expires_at IS DISTINCT FROM OLD.expires_at
     ) THEN
    RAISE EXCEPTION 'Only support feedback can be changed by the user'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_platform_support_conversation_update
  ON public.platform_support_conversations;
CREATE TRIGGER guard_platform_support_conversation_update
  BEFORE UPDATE ON public.platform_support_conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_platform_support_conversation_update();

CREATE TABLE IF NOT EXISTS public.platform_support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    REFERENCES public.platform_support_conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL
    CHECK (sender_type IN ('user', 'assistant', 'system', 'creator')),
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 20000),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_support_messages_conversation
  ON public.platform_support_messages(conversation_id, created_at);
ALTER TABLE public.platform_support_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.platform_support_messages TO authenticated;
GRANT ALL ON public.platform_support_messages TO service_role;

DROP POLICY IF EXISTS platform_support_messages_select
  ON public.platform_support_messages;
CREATE POLICY platform_support_messages_select
  ON public.platform_support_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_support_conversations conversation
    WHERE conversation.id = platform_support_messages.conversation_id
      AND (
        conversation.user_id = auth.uid()
        OR public.is_platform_admin(auth.uid(), 'platform_support')
      )
  ));
DROP POLICY IF EXISTS platform_support_messages_insert
  ON public.platform_support_messages;
CREATE POLICY platform_support_messages_insert
  ON public.platform_support_messages FOR INSERT TO authenticated
  WITH CHECK (
    (sender_type = 'user' AND sender_user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.platform_support_conversations conversation
      WHERE conversation.id = platform_support_messages.conversation_id
        AND conversation.user_id = auth.uid()
    ))
    OR
    (sender_type = 'creator'
      AND sender_user_id = auth.uid()
      AND public.is_platform_admin(auth.uid(), 'platform_support'))
  );

CREATE TABLE IF NOT EXISTS public.platform_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE
    REFERENCES public.platform_support_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 180),
  summary TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 3 AND 5000),
  attempted_steps TEXT[] NOT NULL DEFAULT '{}',
  technical_context JSONB NOT NULL DEFAULT '{}'::JSONB,
  current_path TEXT NOT NULL DEFAULT '/dashboard',
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'waiting_user', 'in_progress', 'resolved', 'closed')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_status
  ON public.platform_support_tickets(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_account
  ON public.platform_support_tickets(account_id, created_at DESC);
ALTER TABLE public.platform_support_tickets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.platform_support_tickets TO authenticated;
GRANT ALL ON public.platform_support_tickets TO service_role;

DROP POLICY IF EXISTS platform_support_tickets_select
  ON public.platform_support_tickets;
CREATE POLICY platform_support_tickets_select
  ON public.platform_support_tickets FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid(), 'platform_support')
  );
DROP POLICY IF EXISTS platform_support_tickets_staff_update
  ON public.platform_support_tickets;
CREATE POLICY platform_support_tickets_staff_update
  ON public.platform_support_tickets FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid(), 'platform_support'))
  WITH CHECK (public.is_platform_admin(auth.uid(), 'platform_support'));

CREATE TABLE IF NOT EXISTS public.platform_support_tool_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.platform_support_conversations(id)
    ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL CHECK (length(trim(tool_name)) BETWEEN 3 AND 100),
  input_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  result_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_support_tool_audit_conversation
  ON public.platform_support_tool_audit(conversation_id, created_at DESC);
ALTER TABLE public.platform_support_tool_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_support_tool_audit FROM anon, authenticated;
GRANT ALL ON public.platform_support_tool_audit TO service_role;

-- Google Calendar connection and support availability are global creator data.
CREATE TABLE IF NOT EXISTS public.platform_support_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  meeting_duration_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (meeting_duration_minutes BETWEEN 15 AND 180),
  minimum_notice_minutes INTEGER NOT NULL DEFAULT 120
    CHECK (minimum_notice_minutes BETWEEN 0 AND 43200),
  buffer_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (buffer_minutes BETWEEN 0 AND 180),
  max_meetings_per_day INTEGER NOT NULL DEFAULT 6
    CHECK (max_meetings_per_day BETWEEN 1 AND 50),
  availability JSONB NOT NULL DEFAULT
    '{"1":[["09:00","18:00"]],"2":[["09:00","18:00"]],"3":[["09:00","18:00"]],"4":[["09:00","18:00"]],"5":[["09:00","17:00"]]}'::JSONB,
  blocked_dates DATE[] NOT NULL DEFAULT '{}',
  google_calendar_id TEXT,
  google_account_email TEXT,
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.platform_support_settings(id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_support_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_support_settings FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.platform_support_settings TO authenticated;
GRANT ALL ON public.platform_support_settings TO service_role;
DROP POLICY IF EXISTS platform_support_settings_owner
  ON public.platform_support_settings;
CREATE POLICY platform_support_settings_owner
  ON public.platform_support_settings FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid(), 'platform_owner'))
  WITH CHECK (public.is_platform_admin(auth.uid(), 'platform_owner'));

CREATE TABLE IF NOT EXISTS public.platform_support_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  support_conversation_id UUID NOT NULL
    REFERENCES public.platform_support_conversations(id) ON DELETE CASCADE,
  support_ticket_id UUID
    REFERENCES public.platform_support_tickets(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  attendee_name TEXT NOT NULL CHECK (length(trim(attendee_name)) BETWEEN 2 AND 160),
  attendee_email TEXT NOT NULL CHECK (length(trim(attendee_email)) BETWEEN 3 AND 320),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 2000),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  provider TEXT NOT NULL DEFAULT 'google_calendar',
  external_event_id TEXT,
  meeting_url TEXT,
  cancellation_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_platform_support_bookings_future
  ON public.platform_support_bookings(starts_at)
  WHERE status IN ('pending', 'confirmed');
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_support_booking_exact_slot
  ON public.platform_support_bookings(starts_at, ends_at)
  WHERE status IN ('pending', 'confirmed');
ALTER TABLE public.platform_support_bookings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_support_bookings TO authenticated;
GRANT ALL ON public.platform_support_bookings TO service_role;
DROP POLICY IF EXISTS platform_support_bookings_select
  ON public.platform_support_bookings;
CREATE POLICY platform_support_bookings_select
  ON public.platform_support_bookings FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid(), 'platform_support')
  );

-- Atomic local reservation. Google event creation happens afterwards; the
-- server cancels the pending row if the provider call fails.
CREATE OR REPLACE FUNCTION public.reserve_platform_support_booking(
  p_conversation_id UUID,
  p_ticket_id UUID,
  p_attendee_name TEXT,
  p_attendee_email TEXT,
  p_reason TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_timezone TEXT,
  p_cancellation_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.platform_support_conversations%ROWTYPE;
  v_booking_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_conversation
  FROM public.platform_support_conversations
  WHERE id = p_conversation_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = '42501';
  END IF;
  IF p_ends_at <= p_starts_at OR p_starts_at <= NOW() THEN
    RAISE EXCEPTION 'Invalid booking time' USING ERRCODE = '22023';
  END IF;
  IF p_ticket_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.platform_support_tickets ticket
    WHERE ticket.id = p_ticket_id
      AND ticket.conversation_id = p_conversation_id
      AND ticket.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Support ticket not found' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_starts_at::TEXT, 71));
  IF EXISTS (
    SELECT 1 FROM public.platform_support_bookings booking
    WHERE booking.status IN ('pending', 'confirmed')
      AND tstzrange(booking.starts_at, booking.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'BOOKING_SLOT_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.platform_support_bookings (
    support_conversation_id, support_ticket_id, user_id, account_id,
    attendee_name, attendee_email, reason, starts_at, ends_at, timezone,
    cancellation_token_hash
  ) VALUES (
    p_conversation_id, p_ticket_id, auth.uid(), v_conversation.account_id,
    trim(p_attendee_name), lower(trim(p_attendee_email)), trim(p_reason),
    p_starts_at, p_ends_at, p_timezone, p_cancellation_token_hash
  ) RETURNING id INTO v_booking_id;
  RETURN v_booking_id;
END;
$$;
ALTER FUNCTION public.reserve_platform_support_booking(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reserve_platform_support_booking(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_platform_support_booking(
  UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT
) TO authenticated, service_role;

-- One aggregate RPC for the creator activity page.
CREATE OR REPLACE FUNCTION public.platform_activity_snapshot()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT jsonb_build_object(
    'generated_at', NOW(),
    'metrics', jsonb_build_object(
      'online_now', (SELECT COUNT(*) FROM public.platform_user_presence WHERE last_seen_at >= NOW() - INTERVAL '2 minutes'),
      'active_24h', (SELECT COUNT(*) FROM public.platform_user_presence WHERE last_seen_at >= NOW() - INTERVAL '24 hours'),
      'active_accounts_24h', (SELECT COUNT(DISTINCT account_id) FROM public.platform_user_presence WHERE last_seen_at >= NOW() - INTERVAL '24 hours'),
      'total_users', (SELECT COUNT(*) FROM public.profiles),
      'total_accounts', (SELECT COUNT(*) FROM public.accounts),
      'active_whatsapp', (SELECT COUNT(*) FROM public.whatsapp_config WHERE status = 'connected'),
      'open_support_cases', (SELECT COUNT(*) FROM public.platform_support_tickets WHERE status IN ('open', 'waiting_user', 'in_progress')),
      'future_bookings', (SELECT COUNT(*) FROM public.platform_support_bookings WHERE status = 'confirmed' AND starts_at > NOW())
    ),
    'users', COALESCE((
      SELECT jsonb_agg(row_data ORDER BY last_seen_at DESC NULLS LAST)
      FROM (
        SELECT
          profile.user_id,
          profile.full_name,
          profile.email,
          profile.account_role::TEXT AS role,
          account.id AS account_id,
          account.name AS account_name,
          account.plan_code,
          presence.current_path,
          presence.device_type,
          presence.signed_in_at,
          presence.last_seen_at,
          CASE
            WHEN presence.last_seen_at >= NOW() - INTERVAL '2 minutes' THEN 'connected'
            WHEN presence.last_seen_at >= NOW() - INTERVAL '24 hours' THEN 'inactive'
            ELSE 'disconnected'
          END AS presence_status
        FROM public.profiles profile
        JOIN public.accounts account ON account.id = profile.account_id
        LEFT JOIN public.platform_user_presence presence
          ON presence.user_id = profile.user_id
        ORDER BY presence.last_seen_at DESC NULLS LAST
        LIMIT 1000
      ) row_data
    ), '[]'::JSONB)
  );
$$;
ALTER FUNCTION public.platform_activity_snapshot() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.platform_activity_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_activity_snapshot() TO service_role;

CREATE OR REPLACE FUNCTION public.platform_support_statistics()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'conversations_started', (SELECT COUNT(*) FROM public.platform_support_conversations),
    'resolved_by_ai', (SELECT COUNT(*) FROM public.platform_support_conversations WHERE resolution_type = 'ai_resolved'),
    'escalated', (SELECT COUNT(*) FROM public.platform_support_conversations WHERE escalated_at IS NOT NULL),
    'meetings_booked', (SELECT COUNT(*) FROM public.platform_support_bookings WHERE status = 'confirmed'),
    'positive_feedback', (SELECT COUNT(*) FROM public.platform_support_conversations WHERE feedback = 'resolved'),
    'negative_feedback', (SELECT COUNT(*) FROM public.platform_support_conversations WHERE feedback = 'needs_support')
  );
$$;
ALTER FUNCTION public.platform_support_statistics() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.platform_support_statistics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_support_statistics() TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_platform_support()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted BIGINT;
BEGIN
  DELETE FROM public.platform_support_conversations
  WHERE expires_at < NOW()
    AND status IN ('resolved', 'closed');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
ALTER FUNCTION public.purge_expired_platform_support() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.purge_expired_platform_support() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_platform_support() TO service_role;

-- Consistent updated_at maintenance.
DROP TRIGGER IF EXISTS set_updated_at ON public.platform_support_documents;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.platform_support_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON public.platform_support_conversations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.platform_support_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON public.platform_support_tickets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.platform_support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON public.platform_support_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.platform_support_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON public.platform_support_bookings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.platform_support_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
