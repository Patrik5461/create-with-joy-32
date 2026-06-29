
CREATE TABLE public.logistics_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filled')),
  address_override TEXT,
  floor TEXT,
  has_elevator BOOLEAN,
  elevator_info TEXT,
  access_type TEXT,
  access_note TEXT,
  parking_available BOOLEAN,
  parking_note TEXT,
  distance_info TEXT,
  door_width TEXT,
  time_restrictions TEXT,
  onsite_contact_name TEXT,
  onsite_contact_phone TEXT,
  prearrival_contact_name TEXT,
  prearrival_contact_phone TEXT,
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_surveys TO authenticated;
GRANT ALL ON public.logistics_surveys TO service_role;

ALTER TABLE public.logistics_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can view surveys"
  ON public.logistics_surveys FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated staff can insert surveys"
  ON public.logistics_surveys FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated staff can update surveys"
  ON public.logistics_surveys FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated staff can delete surveys"
  ON public.logistics_surveys FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_logistics_surveys_updated_at
  BEFORE UPDATE ON public.logistics_surveys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_logistics_surveys_reservation ON public.logistics_surveys(reservation_id);
CREATE INDEX idx_logistics_surveys_token ON public.logistics_surveys(token);
