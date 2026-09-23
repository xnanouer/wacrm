-- Nexora Support Calendar becomes the source of truth for support sessions.
-- Google Calendar remains an optional synchronization target.

ALTER TABLE public.platform_support_bookings
  ALTER COLUMN provider SET DEFAULT 'nexora';

ALTER TABLE public.platform_support_bookings
  ADD COLUMN IF NOT EXISTS external_sync_status TEXT NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS external_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_support_bookings_external_sync_status_check'
      AND conrelid = 'public.platform_support_bookings'::regclass
  ) THEN
    ALTER TABLE public.platform_support_bookings
      ADD CONSTRAINT platform_support_bookings_external_sync_status_check
      CHECK (external_sync_status IN (
        'not_connected', 'pending', 'synced', 'failed', 'cancelled'
      ));
  END IF;
END;
$$;

UPDATE public.platform_support_bookings
SET
  provider = 'nexora',
  external_sync_status = CASE
    WHEN external_event_id IS NOT NULL THEN 'synced'
    ELSE 'not_connected'
  END,
  external_synced_at = CASE
    WHEN external_event_id IS NOT NULL THEN COALESCE(external_synced_at, updated_at)
    ELSE external_synced_at
  END
WHERE provider IS DISTINCT FROM 'nexora'
   OR external_sync_status IS NULL
   OR (external_event_id IS NOT NULL AND external_sync_status <> 'synced');

CREATE INDEX IF NOT EXISTS idx_platform_support_calendar_status_start
  ON public.platform_support_bookings(status, starts_at);

-- Reservations are confirmed atomically in Nexora. External providers are
-- synchronized afterwards and never control whether the internal booking exists.
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
    SELECT 1
    FROM public.platform_support_tickets ticket
    WHERE ticket.id = p_ticket_id
      AND ticket.conversation_id = p_conversation_id
      AND ticket.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Support ticket not found' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_starts_at::TEXT, 71));

  IF EXISTS (
    SELECT 1
    FROM public.platform_support_bookings booking
    WHERE booking.status IN ('pending', 'confirmed')
      AND tstzrange(booking.starts_at, booking.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'BOOKING_SLOT_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.platform_support_bookings (
    support_conversation_id,
    support_ticket_id,
    user_id,
    account_id,
    attendee_name,
    attendee_email,
    reason,
    starts_at,
    ends_at,
    timezone,
    status,
    provider,
    external_sync_status,
    cancellation_token_hash
  ) VALUES (
    p_conversation_id,
    p_ticket_id,
    auth.uid(),
    v_conversation.account_id,
    trim(p_attendee_name),
    lower(trim(p_attendee_email)),
    trim(p_reason),
    p_starts_at,
    p_ends_at,
    p_timezone,
    'confirmed',
    'nexora',
    'not_connected',
    p_cancellation_token_hash
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

-- Atomic creator-only rescheduling, excluding the booking being moved.
CREATE OR REPLACE FUNCTION public.reschedule_platform_support_booking(
  p_booking_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_timezone TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.platform_support_bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_platform_admin(auth.uid(), 'platform_owner') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking
  FROM public.platform_support_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.status NOT IN ('pending', 'confirmed')
     OR p_ends_at <= p_starts_at
     OR p_starts_at <= NOW() THEN
    RAISE EXCEPTION 'Invalid booking time' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_starts_at::TEXT, 72));

  IF EXISTS (
    SELECT 1
    FROM public.platform_support_bookings booking
    WHERE booking.id <> p_booking_id
      AND booking.status IN ('pending', 'confirmed')
      AND tstzrange(booking.starts_at, booking.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'BOOKING_SLOT_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.platform_support_bookings
  SET
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    timezone = p_timezone,
    status = 'confirmed',
    external_sync_status = CASE
      WHEN external_event_id IS NULL THEN 'not_connected'
      ELSE 'pending'
    END,
    external_sync_error = NULL,
    cancelled_at = NULL,
    completed_at = NULL
  WHERE id = p_booking_id;

  RETURN p_booking_id;
END;
$$;

ALTER FUNCTION public.reschedule_platform_support_booking(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reschedule_platform_support_booking(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_platform_support_booking(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
