-- ============================================================
-- 042 — Personal quick replies + operational ticket tags
-- ============================================================

ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'shared'
  CHECK (visibility IN ('shared', 'personal'));

DROP INDEX IF EXISTS idx_quick_replies_account_department_shortcut;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_replies_shared_shortcut
  ON quick_replies(
    account_id,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    shortcut
  )
  WHERE shortcut IS NOT NULL AND visibility = 'shared';

CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_replies_personal_shortcut
  ON quick_replies(account_id, created_by_user_id, shortcut)
  WHERE shortcut IS NOT NULL AND visibility = 'personal';

DROP POLICY IF EXISTS quick_replies_select ON quick_replies;
DROP POLICY IF EXISTS quick_replies_insert ON quick_replies;
DROP POLICY IF EXISTS quick_replies_update ON quick_replies;
DROP POLICY IF EXISTS quick_replies_delete ON quick_replies;

CREATE POLICY quick_replies_select ON quick_replies FOR SELECT
  USING (
    is_account_member(account_id)
    AND (
      (visibility = 'personal' AND created_by_user_id = auth.uid())
      OR (
        visibility = 'shared'
        AND (
          department_id IS NULL
          OR current_account_role(account_id) IN ('owner', 'admin')
          OR is_department_member(department_id)
          OR is_department_supervisor(department_id)
        )
      )
    )
  );

CREATE POLICY quick_replies_insert ON quick_replies FOR INSERT
  WITH CHECK (
    (
      visibility = 'personal'
      AND created_by_user_id = auth.uid()
      AND department_id IS NULL
      AND current_account_role(account_id) IN (
        'owner', 'admin', 'supervisor', 'agent'
      )
    )
    OR (
      visibility = 'shared'
      AND (
        current_account_role(account_id) IN ('owner', 'admin')
        OR (
          current_account_role(account_id) = 'supervisor'
          AND department_id IS NOT NULL
          AND is_department_supervisor(department_id)
        )
      )
    )
  );

CREATE POLICY quick_replies_update ON quick_replies FOR UPDATE
  USING (
    (visibility = 'personal' AND created_by_user_id = auth.uid())
    OR current_account_role(account_id) IN ('owner', 'admin')
    OR (
      visibility = 'shared'
      AND current_account_role(account_id) = 'supervisor'
      AND department_id IS NOT NULL
      AND is_department_supervisor(department_id)
    )
  )
  WITH CHECK (
    (visibility = 'personal' AND created_by_user_id = auth.uid())
    OR current_account_role(account_id) IN ('owner', 'admin')
    OR (
      visibility = 'shared'
      AND current_account_role(account_id) = 'supervisor'
      AND department_id IS NOT NULL
      AND is_department_supervisor(department_id)
    )
  );

CREATE POLICY quick_replies_delete ON quick_replies FOR DELETE
  USING (
    (visibility = 'personal' AND created_by_user_id = auth.uid())
    OR current_account_role(account_id) IN ('owner', 'admin')
    OR (
      visibility = 'shared'
      AND current_account_role(account_id) = 'supervisor'
      AND department_id IS NOT NULL
      AND is_department_supervisor(department_id)
    )
  );

-- Agents may attach/remove an existing account tag only when they can
-- operate a ticket for that contact. The tag catalogue itself stays admin-only.
CREATE OR REPLACE FUNCTION can_operate_contact_tag(target_contact_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM contacts contact
    JOIN profiles profile
      ON profile.user_id = auth.uid()
     AND profile.account_id = contact.account_id
    WHERE contact.id = target_contact_id
      AND (
        profile.account_role::text IN ('owner', 'admin')
        OR EXISTS (
          SELECT 1
          FROM conversations conversation
          WHERE conversation.contact_id = contact.id
            AND can_operate_ticket(conversation.id)
        )
      )
  );
$$;

ALTER FUNCTION can_operate_contact_tag(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION can_operate_contact_tag(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_operate_contact_tag(UUID)
  TO authenticated, service_role;

DROP POLICY IF EXISTS contact_tags_modify ON contact_tags;
CREATE POLICY contact_tags_modify ON contact_tags FOR ALL
  USING (
    can_operate_contact_tag(contact_id)
    AND EXISTS (
      SELECT 1
      FROM contacts contact
      JOIN tags tag ON tag.account_id = contact.account_id
      WHERE contact.id = contact_tags.contact_id
        AND tag.id = contact_tags.tag_id
    )
  )
  WITH CHECK (
    can_operate_contact_tag(contact_id)
    AND EXISTS (
      SELECT 1
      FROM contacts contact
      JOIN tags tag ON tag.account_id = contact.account_id
      WHERE contact.id = contact_tags.contact_id
        AND tag.id = contact_tags.tag_id
    )
  );
