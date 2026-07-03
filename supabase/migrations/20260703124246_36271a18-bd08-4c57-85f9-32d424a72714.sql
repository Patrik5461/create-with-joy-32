
-- Security-definer helper (idempotent).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Table
CREATE TABLE public.reservation_staff (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  external_name TEXT NULL,
  role TEXT NULL,
  planned_start TIMESTAMPTZ NULL,
  planned_end TIMESTAMPTZ NULL,
  actual_arrival TIMESTAMPTZ NULL,
  actual_departure TIMESTAMPTZ NULL,
  arrived BOOLEAN NOT NULL DEFAULT false,
  departed BOOLEAN NOT NULL DEFAULT false,
  note TEXT NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reservation_staff_person_ck
    CHECK (user_id IS NOT NULL OR (external_name IS NOT NULL AND length(btrim(external_name)) > 0))
);

CREATE INDEX reservation_staff_reservation_id_idx ON public.reservation_staff(reservation_id);
CREATE INDEX reservation_staff_user_id_idx ON public.reservation_staff(user_id);
CREATE INDEX reservation_staff_planned_start_idx ON public.reservation_staff(planned_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_staff TO authenticated;
GRANT ALL ON public.reservation_staff TO service_role;

ALTER TABLE public.reservation_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read reservation staff"
  ON public.reservation_staff FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin or manager can insert reservation staff"
  ON public.reservation_staff FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Admin or manager can update reservation staff"
  ON public.reservation_staff FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Admin or manager can delete reservation staff"
  ON public.reservation_staff FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE TRIGGER reservation_staff_set_updated_at
  BEFORE UPDATE ON public.reservation_staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
