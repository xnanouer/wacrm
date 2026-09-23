-- ============================================================
-- 078 - Human-agent coaching
-- ============================================================
-- Reviews are created only by the trusted server runtime. Agents can read
-- their own feedback; company administrators can supervise the full team.
-- Customer-facing bot turns are deliberately excluded by the runtime.

SET search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS public.ai_coaching_settings (
  account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  analyze_on_close BOOLEAN NOT NULL DEFAULT TRUE,
  notify_agent BOOLEAN NOT NULL DEFAULT TRUE,
  notify_admins BOOLEAN NOT NULL DEFAULT TRUE,
  min_human_messages SMALLINT NOT NULL DEFAULT 2
    CHECK (min_human_messages BETWEEN 1 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ai_coaching_settings (account_id)
SELECT account.id FROM public.accounts account
ON CONFLICT (account_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_account_ai_coaching_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.ai_coaching_settings (account_id)
  VALUES (NEW.id)
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.seed_account_ai_coaching_settings() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.seed_account_ai_coaching_settings()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS on_account_seed_ai_coaching_settings ON public.accounts;
CREATE TRIGGER on_account_seed_ai_coaching_settings
  AFTER INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.seed_account_ai_coaching_settings();

DROP TRIGGER IF EXISTS set_updated_at ON public.ai_coaching_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.ai_coaching_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.ai_coaching_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL
    REFERENCES public.conversations(id) ON DELETE CASCADE,
  conversation_closed_at TIMESTAMPTZ NOT NULL,
  agent_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  triggered_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL DEFAULT 'ticket_closed'
    CHECK (trigger_type IN ('ticket_closed', 'manual')),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  contact_name TEXT,
  summary TEXT,
  strengths JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(strengths) = 'array'),
  improvements JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(improvements) = 'array'),
  next_actions JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(next_actions) = 'array'),
  scores JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(scores) = 'object'),
  overall_score SMALLINT CHECK (overall_score BETWEEN 0 AND 100),
  analyzed_message_count INTEGER NOT NULL DEFAULT 0
    CHECK (analyzed_message_count >= 0),
  provider TEXT,
  model TEXT,
  point_operation_id UUID REFERENCES public.ai_point_operations(id)
    ON DELETE SET NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT ai_coaching_reviews_resolution_unique
    UNIQUE (conversation_id, conversation_closed_at)
);

CREATE INDEX IF NOT EXISTS idx_ai_coaching_reviews_account_created
  ON public.ai_coaching_reviews(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_coaching_reviews_agent_created
  ON public.ai_coaching_reviews(agent_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_coaching_reviews_status
  ON public.ai_coaching_reviews(account_id, status, created_at DESC);

ALTER TABLE public.ai_coaching_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_coaching_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_coaching_settings_select
  ON public.ai_coaching_settings;
CREATE POLICY ai_coaching_settings_select
  ON public.ai_coaching_settings FOR SELECT
  USING (public.is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS ai_coaching_settings_insert
  ON public.ai_coaching_settings;
CREATE POLICY ai_coaching_settings_insert
  ON public.ai_coaching_settings FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_coaching_settings_update
  ON public.ai_coaching_settings;
CREATE POLICY ai_coaching_settings_update
  ON public.ai_coaching_settings FOR UPDATE
  USING (public.is_account_member(account_id, 'admin'))
  WITH CHECK (public.is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_coaching_reviews_select
  ON public.ai_coaching_reviews;
CREATE POLICY ai_coaching_reviews_select
  ON public.ai_coaching_reviews FOR SELECT
  USING (
    public.is_account_member(account_id, 'admin')
    OR (
      auth.uid() = agent_user_id
      AND public.is_account_member(account_id, 'agent')
    )
  );

REVOKE ALL ON TABLE public.ai_coaching_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_coaching_settings
  TO authenticated;
GRANT ALL ON TABLE public.ai_coaching_settings TO service_role;

REVOKE ALL ON TABLE public.ai_coaching_reviews FROM anon, authenticated;
GRANT SELECT ON TABLE public.ai_coaching_reviews TO authenticated;
GRANT ALL ON TABLE public.ai_coaching_reviews TO service_role;

INSERT INTO public.ai_point_action_costs (
  action_key,
  customer_label,
  category,
  billing_unit,
  points_per_unit,
  max_duration_seconds,
  sort_order
)
VALUES (
  'agent_coaching_analysis',
  'Análisis del Coach IA',
  'analysis',
  'fixed',
  2,
  NULL,
  45
)
ON CONFLICT (action_key) DO NOTHING;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS coaching_review_id UUID
    REFERENCES public.ai_coaching_reviews(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'conversation_assigned',
    'catalog_approval_requested',
    'catalog_item_approved',
    'catalog_item_rejected',
    'support_booking_confirmed',
    'support_booking_rescheduled',
    'support_booking_cancelled',
    'nexora_points_gift',
    'ai_coaching_ready'
  ));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_subject_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_subject_check CHECK (
    (
      type = 'conversation_assigned'
      AND conversation_id IS NOT NULL
      AND catalog_item_id IS NULL
      AND support_booking_id IS NULL
      AND coaching_review_id IS NULL
    )
    OR
    (
      type IN (
        'catalog_approval_requested',
        'catalog_item_approved',
        'catalog_item_rejected'
      )
      AND catalog_item_id IS NOT NULL
      AND support_booking_id IS NULL
      AND coaching_review_id IS NULL
    )
    OR
    (
      type IN (
        'support_booking_confirmed',
        'support_booking_rescheduled',
        'support_booking_cancelled'
      )
      AND support_booking_id IS NOT NULL
      AND catalog_item_id IS NULL
      AND coaching_review_id IS NULL
    )
    OR
    (
      type = 'nexora_points_gift'
      AND conversation_id IS NULL
      AND catalog_item_id IS NULL
      AND support_booking_id IS NULL
      AND coaching_review_id IS NULL
    )
    OR
    (
      type = 'ai_coaching_ready'
      AND coaching_review_id IS NOT NULL
      AND conversation_id IS NOT NULL
      AND catalog_item_id IS NULL
      AND support_booking_id IS NULL
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_coaching_reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.ai_coaching_reviews;
  END IF;
END $$;

COMMENT ON TABLE public.ai_coaching_reviews IS
  'Private coaching generated from human-agent turns only. Agents see their own reviews; administrators see their company team.';

NOTIFY pgrst, 'reload schema';
