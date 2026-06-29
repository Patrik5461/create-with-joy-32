ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trip_count integer NOT NULL DEFAULT 1 CHECK (trip_count >= 1);