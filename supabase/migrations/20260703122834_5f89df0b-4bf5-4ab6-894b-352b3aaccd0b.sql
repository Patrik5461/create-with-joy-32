ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS event_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_end_at timestamptz;