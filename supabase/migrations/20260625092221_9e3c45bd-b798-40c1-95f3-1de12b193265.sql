ALTER TABLE public.reservations 
  ALTER COLUMN depart_at DROP NOT NULL,
  ALTER COLUMN event_start_at DROP NOT NULL,
  ALTER COLUMN event_end_at DROP NOT NULL,
  ALTER COLUMN return_at DROP NOT NULL;