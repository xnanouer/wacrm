-- In-app notifications for native Nexora support calendar changes.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS support_booking_id UUID
  REFERENCES public.platform_support_bookings(id) ON DELETE CASCADE;

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
    'support_booking_cancelled'
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
  );

CREATE INDEX IF NOT EXISTS idx_notifications_support_booking
  ON public.notifications(support_booking_id, created_at DESC)
  WHERE support_booking_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_support_booking_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_type TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'confirmed' THEN
    v_type := 'support_booking_confirmed';
    v_title := 'Sesión de soporte confirmada';
    v_body := 'Tu sesión quedó guardada en el Calendario Nexora para ' ||
      to_char(NEW.starts_at AT TIME ZONE NEW.timezone, 'DD/MM/YYYY HH24:MI') || '.';
  ELSIF TG_OP = 'UPDATE'
        AND NEW.status = 'cancelled'
        AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_type := 'support_booking_cancelled';
    v_title := 'Sesión de soporte cancelada';
    v_body := 'La sesión del ' ||
      to_char(OLD.starts_at AT TIME ZONE OLD.timezone, 'DD/MM/YYYY HH24:MI') ||
      ' fue cancelada.';
  ELSIF TG_OP = 'UPDATE'
        AND (
          OLD.starts_at IS DISTINCT FROM NEW.starts_at
          OR OLD.ends_at IS DISTINCT FROM NEW.ends_at
        ) THEN
    v_type := 'support_booking_rescheduled';
    v_title := 'Sesión de soporte reprogramada';
    v_body := 'Tu nuevo horario en el Calendario Nexora es ' ||
      to_char(NEW.starts_at AT TIME ZONE NEW.timezone, 'DD/MM/YYYY HH24:MI') || '.';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    account_id,
    user_id,
    type,
    support_booking_id,
    actor_user_id,
    title,
    body
  ) VALUES (
    NEW.account_id,
    NEW.user_id,
    v_type,
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE auth.uid() END,
    v_title,
    v_body
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create support booking notification for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_support_booking_change() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_support_booking_changed
  ON public.platform_support_bookings;
CREATE TRIGGER on_support_booking_changed
  AFTER INSERT OR UPDATE OF starts_at, ends_at, status
  ON public.platform_support_bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_support_booking_change();

NOTIFY pgrst, 'reload schema';
