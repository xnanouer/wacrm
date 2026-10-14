-- Paid, account-scoped follow-up agent and recurring add-on entitlement.
-- The existing ai_configs row remains the shared managed-AI runtime and the
-- primary agent. This migration adds a specialized second profile without
-- changing the one-config-per-account contract used by inbound replies.

SET search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Billing entitlement
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  addon_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'active', 'past_due', 'canceled', 'suspended')
  ),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100),
  monthly_price_snapshot NUMERIC(12, 2) NOT NULL CHECK (
    monthly_price_snapshot >= 0
  ),
  included_points INTEGER NOT NULL DEFAULT 0 CHECK (included_points >= 0),
  provider TEXT,
  provider_subscription_id TEXT,
  current_period_ends_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_addons_account_code_unique UNIQUE (account_id, addon_code),
  CONSTRAINT account_addons_supported_code_check CHECK (
    addon_code IN ('follow_up_agent')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS account_addons_provider_subscription_unique
  ON public.account_addons(provider, provider_subscription_id)
  WHERE provider IS NOT NULL AND provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS account_addons_account_status_idx
  ON public.account_addons(account_id, status);

DROP TRIGGER IF EXISTS set_updated_at ON public.account_addons;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.account_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.account_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_addons_select ON public.account_addons;
CREATE POLICY account_addons_select ON public.account_addons FOR SELECT
  USING (
    public.is_account_profile_member(account_id)
    AND public.current_account_role(account_id)::TEXT IN ('owner', 'admin')
  );
REVOKE ALL ON TABLE public.account_addons FROM anon, authenticated;
GRANT SELECT ON TABLE public.account_addons TO authenticated;
GRANT ALL ON TABLE public.account_addons TO service_role;

-- Checkout intents and payment history can now represent a recurring add-on.
ALTER TABLE public.billing_checkout_intents
  ADD COLUMN IF NOT EXISTS addon_code TEXT;
ALTER TABLE public.billing_checkout_intents
  DROP CONSTRAINT IF EXISTS billing_checkout_intents_kind_check,
  DROP CONSTRAINT IF EXISTS billing_checkout_intent_product_check;
ALTER TABLE public.billing_checkout_intents
  ADD CONSTRAINT billing_checkout_intents_kind_check CHECK (
    kind IN ('subscription', 'points', 'addon')
  ),
  ADD CONSTRAINT billing_checkout_intent_product_check CHECK (
    (kind = 'subscription' AND plan_code IS NOT NULL
      AND point_package_id IS NULL AND addon_code IS NULL)
    OR
    (kind = 'points' AND point_package_id IS NOT NULL
      AND plan_code IS NULL AND addon_code IS NULL)
    OR
    (kind = 'addon' AND addon_code IS NOT NULL
      AND plan_code IS NULL AND point_package_id IS NULL)
  ),
  ADD CONSTRAINT billing_checkout_intents_addon_code_check CHECK (
    addon_code IS NULL OR addon_code IN ('follow_up_agent')
  );

ALTER TABLE public.billing_payments
  DROP CONSTRAINT IF EXISTS billing_payments_kind_check;
ALTER TABLE public.billing_payments
  ADD CONSTRAINT billing_payments_kind_check CHECK (
    kind IN ('subscription', 'points', 'addon')
  );

-- ---------------------------------------------------------------------------
-- Specialized agent profile and durable queue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_follow_up_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  agent_name TEXT NOT NULL DEFAULT 'Agente de Seguimiento',
  objective TEXT NOT NULL DEFAULT 'follow_up',
  custom_objective TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT 'commercial',
  custom_tone TEXT NOT NULL DEFAULT '',
  additional_instructions TEXT NOT NULL DEFAULT '',
  first_delay_hours INTEGER NOT NULL DEFAULT 20 CHECK (
    first_delay_hours BETWEEN 1 AND 168
  ),
  second_delay_hours INTEGER NOT NULL DEFAULT 72 CHECK (
    second_delay_hours BETWEEN 1 AND 336
  ),
  max_attempts SMALLINT NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 3),
  timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  active_days SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6]::SMALLINT[],
  starts_at TIME NOT NULL DEFAULT '09:00',
  ends_at TIME NOT NULL DEFAULT '19:00',
  channels TEXT[] NOT NULL DEFAULT ARRAY['whatsapp','facebook','instagram']::TEXT[],
  whatsapp_template_name TEXT,
  whatsapp_template_language TEXT NOT NULL DEFAULT 'es_CL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_follow_up_agents_name_check CHECK (
    length(trim(agent_name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT ai_follow_up_agents_objective_check CHECK (
    objective IN (
      'answer_faqs', 'capture_customer_data', 'qualify_leads',
      'create_opportunities', 'get_visit', 'handoff',
      'catalog_support', 'follow_up', 'custom'
    )
  ),
  CONSTRAINT ai_follow_up_agents_tone_check CHECK (
    tone IN ('professional', 'friendly', 'direct', 'formal',
             'commercial', 'technical', 'custom')
  ),
  CONSTRAINT ai_follow_up_agents_text_check CHECK (
    length(custom_objective) <= 3000
    AND length(custom_tone) <= 2000
    AND length(additional_instructions) <= 10000
    AND length(timezone) BETWEEN 1 AND 80
    AND length(COALESCE(whatsapp_template_name, '')) <= 512
    AND length(whatsapp_template_language) BETWEEN 2 AND 20
  ),
  CONSTRAINT ai_follow_up_agents_hours_check CHECK (starts_at < ends_at),
  CONSTRAINT ai_follow_up_agents_days_check CHECK (
    cardinality(active_days) BETWEEN 1 AND 7
    AND active_days <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]
  ),
  CONSTRAINT ai_follow_up_agents_channels_check CHECK (
    cardinality(channels) BETWEEN 1 AND 3
    AND channels <@ ARRAY['whatsapp','facebook','instagram']::TEXT[]
  )
);

DROP TRIGGER IF EXISTS set_updated_at ON public.ai_follow_up_agents;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.ai_follow_up_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_follow_up_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_follow_up_agents_select ON public.ai_follow_up_agents;
DROP POLICY IF EXISTS ai_follow_up_agents_insert ON public.ai_follow_up_agents;
DROP POLICY IF EXISTS ai_follow_up_agents_update ON public.ai_follow_up_agents;
DROP POLICY IF EXISTS ai_follow_up_agents_delete ON public.ai_follow_up_agents;
CREATE POLICY ai_follow_up_agents_select
  ON public.ai_follow_up_agents FOR SELECT
  USING (public.is_account_member(account_id));
CREATE POLICY ai_follow_up_agents_insert
  ON public.ai_follow_up_agents FOR INSERT
  WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY ai_follow_up_agents_update
  ON public.ai_follow_up_agents FOR UPDATE
  USING (public.is_account_member(account_id, 'admin'))
  WITH CHECK (public.is_account_member(account_id, 'admin'));
CREATE POLICY ai_follow_up_agents_delete
  ON public.ai_follow_up_agents FOR DELETE
  USING (public.is_account_member(account_id, 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_follow_up_agents TO authenticated;
GRANT ALL ON public.ai_follow_up_agents TO service_role;

CREATE TABLE IF NOT EXISTS public.ai_follow_up_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_follow_up_agents(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  baseline_message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  attempt SMALLINT NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 3),
  run_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'sent', 'canceled', 'blocked', 'failed')
  ),
  generated_text TEXT,
  sent_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT ai_follow_up_jobs_scope_unique
    UNIQUE (id, account_id)
);

CREATE INDEX IF NOT EXISTS ai_follow_up_jobs_due_idx
  ON public.ai_follow_up_jobs(run_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ai_follow_up_jobs_conversation_idx
  ON public.ai_follow_up_jobs(account_id, conversation_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ai_follow_up_jobs_one_active_conversation
  ON public.ai_follow_up_jobs(conversation_id)
  WHERE status IN ('pending', 'running');

DROP TRIGGER IF EXISTS set_updated_at ON public.ai_follow_up_jobs;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.ai_follow_up_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_follow_up_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_follow_up_jobs_select ON public.ai_follow_up_jobs;
CREATE POLICY ai_follow_up_jobs_select
  ON public.ai_follow_up_jobs FOR SELECT
  USING (public.is_account_member(account_id));
REVOKE ALL ON TABLE public.ai_follow_up_jobs FROM anon, authenticated;
GRANT SELECT ON TABLE public.ai_follow_up_jobs TO authenticated;
GRANT ALL ON TABLE public.ai_follow_up_jobs TO service_role;

-- The origin marker prevents a sent follow-up from recursively scheduling
-- itself while keeping every other outbound path covered by one DB trigger.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS automation_origin TEXT;
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_automation_origin_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_automation_origin_check CHECK (
    automation_origin IS NULL OR automation_origin IN ('follow_up_agent')
  );

CREATE OR REPLACE FUNCTION public.manage_ai_follow_up_job_from_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
  v_agent public.ai_follow_up_agents%ROWTYPE;
  v_channel TEXT;
BEGIN
  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.sender_type = 'customer' THEN
    UPDATE public.ai_follow_up_jobs
    SET status = 'canceled',
        cancel_reason = 'customer_replied',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE conversation_id = NEW.conversation_id
      AND status IN ('pending', 'running');
    RETURN NEW;
  END IF;

  IF NEW.sender_type NOT IN ('agent', 'bot')
     OR NEW.automation_origin = 'follow_up_agent'
     OR v_conversation.status = 'closed'
  THEN
    RETURN NEW;
  END IF;

  SELECT agent.* INTO v_agent
  FROM public.ai_follow_up_agents agent
  JOIN public.account_addons addon
    ON addon.account_id = agent.account_id
   AND addon.addon_code = 'follow_up_agent'
   AND addon.status = 'active'
  WHERE agent.account_id = v_conversation.account_id
    AND agent.is_active = TRUE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_channel := COALESCE(v_conversation.channel, 'whatsapp');
  IF NOT (v_channel = ANY(v_agent.channels)) THEN RETURN NEW; END IF;

  UPDATE public.ai_follow_up_jobs
  SET status = 'canceled',
      cancel_reason = 'newer_outbound_message',
      completed_at = NOW(),
      updated_at = NOW()
  WHERE conversation_id = NEW.conversation_id
    AND status IN ('pending', 'running');

  INSERT INTO public.ai_follow_up_jobs (
    account_id, agent_id, conversation_id, contact_id,
    baseline_message_id, attempt, run_at
  ) VALUES (
    v_conversation.account_id, v_agent.id, v_conversation.id,
    v_conversation.contact_id, NEW.id, 1,
    NOW() + make_interval(hours => v_agent.first_delay_hours)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_manage_ai_follow_up_job ON public.messages;
CREATE TRIGGER messages_manage_ai_follow_up_job
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.manage_ai_follow_up_job_from_message();

-- Follow-up generation has its own customer-facing usage category while
-- retaining the same fixed point price as an automatic text reply.
INSERT INTO public.ai_point_action_costs (
  action_key, customer_label, category, billing_unit,
  points_per_unit, max_duration_seconds, sort_order
) VALUES (
  'follow_up_reply', 'Seguimiento automático', 'text', 'fixed', 1, NULL, 15
)
ON CONFLICT (action_key) DO UPDATE SET
  customer_label = EXCLUDED.customer_label,
  category = EXCLUDED.category,
  billing_unit = EXCLUDED.billing_unit,
  points_per_unit = EXCLUDED.points_per_unit,
  max_duration_seconds = EXCLUDED.max_duration_seconds,
  sort_order = EXCLUDED.sort_order,
  enabled = TRUE;

NOTIFY pgrst, 'reload schema';
