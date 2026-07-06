
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS installation_date date,
  ADD COLUMN IF NOT EXISTS dismantling_date date;

CREATE INDEX IF NOT EXISTS quotes_event_date_idx ON public.quotes (event_date);
CREATE INDEX IF NOT EXISTS quotes_installation_date_idx ON public.quotes (installation_date);
CREATE INDEX IF NOT EXISTS quotes_dismantling_date_idx ON public.quotes (dismantling_date);

-- Backfill from linked reservation, where empty.
UPDATE public.quotes q
SET
  event_date = COALESCE(q.event_date, (r.event_start_at AT TIME ZONE 'Europe/Bratislava')::date),
  installation_date = COALESCE(q.installation_date, (r.load_at AT TIME ZONE 'Europe/Bratislava')::date),
  dismantling_date = COALESCE(q.dismantling_date, (r.return_at AT TIME ZONE 'Europe/Bratislava')::date)
FROM public.reservations r
WHERE q.reservation_id = r.id;

-- Fallback: use quote.event_start_at when there is no reservation.
UPDATE public.quotes q
SET event_date = (q.event_start_at AT TIME ZONE 'Europe/Bratislava')::date
WHERE q.event_date IS NULL AND q.event_start_at IS NOT NULL;
