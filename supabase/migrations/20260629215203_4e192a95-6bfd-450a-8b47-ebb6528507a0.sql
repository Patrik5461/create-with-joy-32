
ALTER TABLE public.furniture_items
  ADD COLUMN IF NOT EXISTS public_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_description text,
  ADD COLUMN IF NOT EXISTS public_price numeric(10,2);

CREATE INDEX IF NOT EXISTS idx_furniture_items_public_visible
  ON public.furniture_items (public_visible) WHERE public_visible;

CREATE TABLE IF NOT EXISTS public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email text NOT NULL,
  phone text,
  event_start_at timestamptz,
  event_end_at timestamptz,
  venue text,
  message text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new',
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  source_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiries TO authenticated;
GRANT ALL ON public.inquiries TO service_role;

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view inquiries"
  ON public.inquiries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can update inquiries"
  ON public.inquiries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins/managers can delete inquiries"
  ON public.inquiries FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role)
      OR private.has_role(auth.uid(), 'manager'::public.app_role));

CREATE TRIGGER trg_inquiries_updated_at
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON public.inquiries(created_at DESC);
