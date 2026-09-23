-- ============================================================
-- 041 — Whaticket-style agent boundaries
--
-- Agents work tickets; they do not browse the company's complete CRM
-- directory or administer pipelines, campaigns, automations, or flows.
-- A contact remains readable when it belongs to a ticket the caller may
-- see, so names and phone numbers still render inside the shared inbox.
-- ============================================================

CREATE OR REPLACE FUNCTION can_view_contact(target_contact_id UUID)
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
            AND can_view_ticket(conversation.id)
        )
      )
  );
$$;

ALTER FUNCTION can_view_contact(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION can_view_contact(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_view_contact(UUID) TO authenticated, service_role;

-- Contacts: global directory and all contact administration are admin-only.
DROP POLICY IF EXISTS contacts_select ON contacts;
DROP POLICY IF EXISTS contacts_insert ON contacts;
DROP POLICY IF EXISTS contacts_update ON contacts;
DROP POLICY IF EXISTS contacts_delete ON contacts;

CREATE POLICY contacts_select ON contacts
  FOR SELECT USING (can_view_contact(id));
CREATE POLICY contacts_insert ON contacts
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY contacts_update ON contacts
  FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY contacts_delete ON contacts
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- Contact metadata follows the visibility of its parent contact, but only an
-- administrator may modify CRM-wide tags, fields, and contact notes. Agents
-- use ticket_notes for operational notes on tickets they can operate.
DROP POLICY IF EXISTS contact_tags_select ON contact_tags;
DROP POLICY IF EXISTS contact_tags_modify ON contact_tags;
CREATE POLICY contact_tags_select ON contact_tags
  FOR SELECT USING (can_view_contact(contact_id));
CREATE POLICY contact_tags_modify ON contact_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM contacts contact
      WHERE contact.id = contact_tags.contact_id
        AND is_account_member(contact.account_id, 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts contact
      WHERE contact.id = contact_tags.contact_id
        AND is_account_member(contact.account_id, 'admin')
    )
  );

DROP POLICY IF EXISTS contact_custom_values_select ON contact_custom_values;
DROP POLICY IF EXISTS contact_custom_values_modify ON contact_custom_values;
CREATE POLICY contact_custom_values_select ON contact_custom_values
  FOR SELECT USING (can_view_contact(contact_id));
CREATE POLICY contact_custom_values_modify ON contact_custom_values
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM contacts contact
      WHERE contact.id = contact_custom_values.contact_id
        AND is_account_member(contact.account_id, 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts contact
      WHERE contact.id = contact_custom_values.contact_id
        AND is_account_member(contact.account_id, 'admin')
    )
  );

DROP POLICY IF EXISTS contact_notes_select ON contact_notes;
DROP POLICY IF EXISTS contact_notes_insert ON contact_notes;
DROP POLICY IF EXISTS contact_notes_update ON contact_notes;
DROP POLICY IF EXISTS contact_notes_delete ON contact_notes;
CREATE POLICY contact_notes_select ON contact_notes
  FOR SELECT USING (can_view_contact(contact_id));
CREATE POLICY contact_notes_insert ON contact_notes
  FOR INSERT WITH CHECK (
    is_account_member(account_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM contacts contact
      WHERE contact.id = contact_notes.contact_id
        AND contact.account_id = contact_notes.account_id
    )
  );
CREATE POLICY contact_notes_update ON contact_notes
  FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY contact_notes_delete ON contact_notes
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- Workspace administration modules. Background workers use service_role and
-- continue to run; browser clients must be owner/admin.
DROP POLICY IF EXISTS pipelines_select ON pipelines;
CREATE POLICY pipelines_select ON pipelines
  FOR SELECT USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS deals_select ON deals;
DROP POLICY IF EXISTS deals_insert ON deals;
DROP POLICY IF EXISTS deals_update ON deals;
DROP POLICY IF EXISTS deals_delete ON deals;
CREATE POLICY deals_select ON deals FOR SELECT
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY deals_insert ON deals FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY deals_update ON deals FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY deals_delete ON deals FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS broadcasts_select ON broadcasts;
DROP POLICY IF EXISTS broadcasts_insert ON broadcasts;
DROP POLICY IF EXISTS broadcasts_update ON broadcasts;
DROP POLICY IF EXISTS broadcasts_delete ON broadcasts;
CREATE POLICY broadcasts_select ON broadcasts FOR SELECT
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY broadcasts_insert ON broadcasts FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY broadcasts_update ON broadcasts FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY broadcasts_delete ON broadcasts FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS broadcast_recipients_select ON broadcast_recipients;
DROP POLICY IF EXISTS broadcast_recipients_modify ON broadcast_recipients;
CREATE POLICY broadcast_recipients_select ON broadcast_recipients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM broadcasts broadcast
      WHERE broadcast.id = broadcast_recipients.broadcast_id
        AND is_account_member(broadcast.account_id, 'admin')
    )
  );
CREATE POLICY broadcast_recipients_modify ON broadcast_recipients FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM broadcasts broadcast
      WHERE broadcast.id = broadcast_recipients.broadcast_id
        AND is_account_member(broadcast.account_id, 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM broadcasts broadcast
      WHERE broadcast.id = broadcast_recipients.broadcast_id
        AND is_account_member(broadcast.account_id, 'admin')
    )
  );

DROP POLICY IF EXISTS automations_select ON automations;
DROP POLICY IF EXISTS automations_insert ON automations;
DROP POLICY IF EXISTS automations_update ON automations;
DROP POLICY IF EXISTS automations_delete ON automations;
CREATE POLICY automations_select ON automations FOR SELECT
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY automations_insert ON automations FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY automations_update ON automations FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY automations_delete ON automations FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS automation_steps_select ON automation_steps;
DROP POLICY IF EXISTS automation_steps_modify ON automation_steps;
CREATE POLICY automation_steps_select ON automation_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM automations automation
      WHERE automation.id = automation_steps.automation_id
        AND is_account_member(automation.account_id, 'admin')
    )
  );
CREATE POLICY automation_steps_modify ON automation_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM automations automation
      WHERE automation.id = automation_steps.automation_id
        AND is_account_member(automation.account_id, 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM automations automation
      WHERE automation.id = automation_steps.automation_id
        AND is_account_member(automation.account_id, 'admin')
    )
  );

DROP POLICY IF EXISTS automation_logs_select ON automation_logs;
CREATE POLICY automation_logs_select ON automation_logs FOR SELECT
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS flows_select ON flows;
DROP POLICY IF EXISTS flows_insert ON flows;
DROP POLICY IF EXISTS flows_update ON flows;
DROP POLICY IF EXISTS flows_delete ON flows;
CREATE POLICY flows_select ON flows FOR SELECT
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY flows_insert ON flows FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY flows_update ON flows FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY flows_delete ON flows FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS flow_nodes_select ON flow_nodes;
DROP POLICY IF EXISTS flow_nodes_modify ON flow_nodes;
CREATE POLICY flow_nodes_select ON flow_nodes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flows flow
      WHERE flow.id = flow_nodes.flow_id
        AND is_account_member(flow.account_id, 'admin')
    )
  );
CREATE POLICY flow_nodes_modify ON flow_nodes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM flows flow
      WHERE flow.id = flow_nodes.flow_id
        AND is_account_member(flow.account_id, 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flows flow
      WHERE flow.id = flow_nodes.flow_id
        AND is_account_member(flow.account_id, 'admin')
    )
  );

DROP POLICY IF EXISTS flow_runs_select ON flow_runs;
CREATE POLICY flow_runs_select ON flow_runs FOR SELECT
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS flow_run_events_select ON flow_run_events;
CREATE POLICY flow_run_events_select ON flow_run_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flow_runs run
      WHERE run.id = flow_run_events.flow_run_id
        AND is_account_member(run.account_id, 'admin')
    )
  );
