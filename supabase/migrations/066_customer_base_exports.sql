-- ============================================================
-- 066 — Customer base and auditable exports
--
-- Gives administrators one tenant-scoped, read-only projection that combines
-- contacts with the newest AI qualification profile, current ticket context,
-- assignment and tags. Export activity is recorded without storing a copy of
-- the exported personal data.
-- ============================================================

SET search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS public.contact_export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  exported_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  export_format TEXT NOT NULL DEFAULT 'csv'
    CHECK (export_format IN ('csv')),
  filters JSONB NOT NULL DEFAULT '{}'::JSONB,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_export_logs_account_created
  ON public.contact_export_logs(account_id, created_at DESC);

ALTER TABLE public.contact_export_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_export_logs_select
  ON public.contact_export_logs;
DROP POLICY IF EXISTS contact_export_logs_insert
  ON public.contact_export_logs;

CREATE POLICY contact_export_logs_select
  ON public.contact_export_logs FOR SELECT
  USING (is_account_member(account_id, 'admin'));

CREATE POLICY contact_export_logs_insert
  ON public.contact_export_logs FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'admin')
    AND exported_by_user_id = auth.uid()
  );

REVOKE ALL ON public.contact_export_logs FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.contact_export_logs TO authenticated;
GRANT ALL ON public.contact_export_logs TO service_role;

CREATE OR REPLACE VIEW public.customer_base_view
WITH (security_invoker = true)
AS
WITH latest_lead_profile AS (
  SELECT DISTINCT ON (profile.account_id, profile.contact_id)
    profile.*
  FROM public.conversation_lead_profiles profile
  ORDER BY
    profile.account_id,
    profile.contact_id,
    profile.updated_at DESC,
    profile.created_at DESC
),
latest_conversation AS (
  SELECT DISTINCT ON (conversation.account_id, conversation.contact_id)
    conversation.id,
    conversation.account_id,
    conversation.contact_id,
    conversation.channel,
    conversation.status,
    conversation.assigned_agent_id,
    conversation.department_id,
    conversation.last_message_at,
    conversation.updated_at,
    conversation.created_at
  FROM public.conversations conversation
  ORDER BY
    conversation.account_id,
    conversation.contact_id,
    COALESCE(
      conversation.last_message_at,
      conversation.updated_at,
      conversation.created_at
    ) DESC,
    conversation.created_at DESC
),
contact_tag_summary AS (
  SELECT
    contact.account_id,
    contact_tag.contact_id,
    ARRAY_AGG(tag.id ORDER BY tag.name) AS tag_ids,
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', tag.id,
        'name', tag.name,
        'color', tag.color
      )
      ORDER BY tag.name
    ) AS tags
  FROM public.contacts contact
  JOIN public.contact_tags contact_tag
    ON contact_tag.contact_id = contact.id
  JOIN public.tags tag
    ON tag.id = contact_tag.tag_id
   AND tag.account_id = contact.account_id
  GROUP BY contact.account_id, contact_tag.contact_id
),
customer_base AS (
  SELECT
    contact.id AS contact_id,
    contact.account_id,
    COALESCE(
      NULLIF(lead.full_name, ''),
      NULLIF(contact.name, ''),
      contact.phone
    ) AS full_name,
    COALESCE(NULLIF(lead.rut, ''), NULLIF(contact.rut, '')) AS rut,
    COALESCE(NULLIF(lead.phone, ''), contact.phone) AS phone,
    contact.email,
    contact.company,
    lead.city,
    COALESCE(
      NULLIF(lead.vehicle_interest, ''),
      NULLIF(contact.interest_product, '')
    ) AS vehicle_interest,
    COALESCE(
      NULLIF(lead.down_payment, ''),
      CASE
        WHEN contact.down_payment IS NULL THEN NULL
        ELSE contact.down_payment::TEXT
      END
    ) AS down_payment,
    lead.income_proof,
    lead.employment_type,
    lead.employment_tenure,
    lead.has_dicom,
    lead.trade_in,
    lead.trade_in_vehicle,
    lead.purchase_timeline,
    lead.financing_requested,
    contact.evaluation_status,
    COALESCE(conversation.channel::TEXT, contact.source) AS source,
    contact.next_follow_up_at,
    contact.commercial_notes,
    COALESCE(tag_summary.tag_ids, ARRAY[]::UUID[]) AS tag_ids,
    COALESCE(tag_summary.tags, '[]'::JSONB) AS tags,
    conversation.id AS conversation_id,
    conversation.status AS conversation_status,
    conversation.assigned_agent_id,
    assigned_profile.full_name AS assigned_agent_name,
    assigned_profile.email AS assigned_agent_email,
    conversation.department_id,
    department.name AS department_name,
    COALESCE(
      conversation.last_message_at,
      conversation.updated_at,
      contact.updated_at,
      contact.created_at
    ) AS last_contact_at,
    lead.updated_at AS profile_updated_at,
    (lead.id IS NOT NULL) AS has_profile,
    (
      CASE WHEN NULLIF(lead.full_name, '') IS NOT NULL THEN 1 ELSE 0 END
      + CASE
          WHEN COALESCE(NULLIF(lead.phone, ''), NULLIF(contact.phone, '')) IS NOT NULL
            THEN 1 ELSE 0
        END
      + CASE WHEN NULLIF(lead.city, '') IS NOT NULL THEN 1 ELSE 0 END
      + CASE
          WHEN COALESCE(NULLIF(lead.vehicle_interest, ''), NULLIF(contact.interest_product, '')) IS NOT NULL
            THEN 1 ELSE 0
        END
      + CASE
          WHEN lead.financing_requested = FALSE OR NULLIF(lead.down_payment, '') IS NOT NULL
            THEN 1 ELSE 0
        END
      + CASE
          WHEN lead.financing_requested = FALSE OR NULLIF(lead.rut, '') IS NOT NULL
            THEN 1 ELSE 0
        END
      + CASE
          WHEN lead.financing_requested = FALSE OR lead.income_proof IS NOT NULL
            THEN 1 ELSE 0
        END
      + CASE
          WHEN lead.financing_requested = FALSE
            OR (
              NULLIF(lead.employment_type, '') IS NOT NULL
              AND NULLIF(lead.employment_tenure, '') IS NOT NULL
            )
            THEN 1 ELSE 0
        END
      + CASE
          WHEN lead.financing_requested = FALSE OR lead.has_dicom IS NOT NULL
            THEN 1 ELSE 0
        END
      + CASE WHEN lead.trade_in IS NOT NULL THEN 1 ELSE 0 END
      + CASE WHEN NULLIF(lead.purchase_timeline, '') IS NOT NULL THEN 1 ELSE 0 END
    )::INTEGER AS profile_completed_fields
  FROM public.contacts contact
  LEFT JOIN latest_lead_profile lead
    ON lead.account_id = contact.account_id
   AND lead.contact_id = contact.id
  LEFT JOIN latest_conversation conversation
    ON conversation.account_id = contact.account_id
   AND conversation.contact_id = contact.id
  LEFT JOIN public.profiles assigned_profile
    ON assigned_profile.account_id = contact.account_id
   AND assigned_profile.user_id = conversation.assigned_agent_id
  LEFT JOIN public.departments department
    ON department.account_id = contact.account_id
   AND department.id = conversation.department_id
  LEFT JOIN contact_tag_summary tag_summary
    ON tag_summary.account_id = contact.account_id
   AND tag_summary.contact_id = contact.id
)
SELECT
  customer_base.*,
  CASE
    WHEN customer_base.has_profile
      THEN ROUND(customer_base.profile_completed_fields * 100.0 / 11)::INTEGER
    ELSE 0
  END AS profile_completion,
  LOWER(CONCAT_WS(
    ' ',
    customer_base.full_name,
    customer_base.rut,
    customer_base.phone,
    customer_base.email,
    customer_base.company,
    customer_base.city,
    customer_base.vehicle_interest,
    customer_base.assigned_agent_name,
    customer_base.department_name
  )) AS search_text
FROM customer_base;

ALTER VIEW public.customer_base_view OWNER TO postgres;
REVOKE ALL ON public.customer_base_view FROM PUBLIC, anon;
GRANT SELECT ON public.customer_base_view TO authenticated, service_role;

COMMENT ON VIEW public.customer_base_view IS
  'Administrator customer directory combining tenant contacts, latest AI qualification, tags and current assignment.';
COMMENT ON TABLE public.contact_export_logs IS
  'Audit trail for customer exports. Stores metadata only, never the exported personal-data file.';

NOTIFY pgrst, 'reload schema';
