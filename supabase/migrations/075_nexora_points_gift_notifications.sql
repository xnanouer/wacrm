-- Notify company administrators when Nexora grants additional AI points.

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
    'nexora_points_gift'
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
    )
    OR
    (
      type = 'nexora_points_gift'
      AND conversation_id IS NULL
      AND catalog_item_id IS NULL
      AND support_booking_id IS NULL
    )
  );

NOTIFY pgrst, 'reload schema';
