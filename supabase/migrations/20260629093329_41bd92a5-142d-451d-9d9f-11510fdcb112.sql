
-- Pricing fields on furniture
ALTER TABLE public.furniture_items
  ADD COLUMN IF NOT EXISTS price_per_day numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_fixed numeric(10,2);

-- Enums
DO $$ BEGIN
  CREATE TYPE public.quote_status AS ENUM ('draft','sent','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.quote_adjust_type AS ENUM ('none','percent','fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.quote_item_kind AS ENUM ('furniture','service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.quote_price_mode AS ENUM ('per_day','fixed','service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sequence for quote numbers
CREATE SEQUENCE IF NOT EXISTS public.quotes_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text UNIQUE NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  status public.quote_status NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  vat_rate numeric(5,2) NOT NULL DEFAULT 23,
  discount_type public.quote_adjust_type NOT NULL DEFAULT 'none',
  discount_value numeric(12,2) NOT NULL DEFAULT 0,
  surcharge_type public.quote_adjust_type NOT NULL DEFAULT 'none',
  surcharge_value numeric(12,2) NOT NULL DEFAULT 0,
  surcharge_label text,
  notes text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total_without_vat numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_with_vat numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
GRANT USAGE ON SEQUENCE public.quotes_number_seq TO authenticated, service_role;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read quotes" ON public.quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert quotes" ON public.quotes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update quotes" ON public.quotes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete quotes" ON public.quotes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_quotes_updated_at BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto quote_number
CREATE OR REPLACE FUNCTION public.assign_quote_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    NEW.quote_number := 'Q' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.quotes_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_quotes_assign_number BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.assign_quote_number();

CREATE TABLE IF NOT EXISTS public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  kind public.quote_item_kind NOT NULL,
  furniture_item_id uuid REFERENCES public.furniture_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  qty numeric(10,2) NOT NULL DEFAULT 1,
  price_mode public.quote_price_mode NOT NULL DEFAULT 'fixed',
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  days integer NOT NULL DEFAULT 1,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read quote_items" ON public.quote_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert quote_items" ON public.quote_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update quote_items" ON public.quote_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete quote_items" ON public.quote_items FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON public.quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON public.quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
