ALTER TABLE public.reservation_staff
  ADD COLUMN IF NOT EXISTS helper_id uuid REFERENCES public.helpers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reservation_staff_helper_id_idx ON public.reservation_staff(helper_id);