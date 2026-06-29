
CREATE TYPE public.protocol_type AS ENUM ('handover', 'return');
CREATE TYPE public.document_status AS ENUM ('draft', 'signed');
CREATE TYPE public.protocol_item_condition AS ENUM ('ok', 'damaged', 'missing');

CREATE SEQUENCE IF NOT EXISTS public.contracts_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.protocols_number_seq START 1;

CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  contract_number TEXT UNIQUE,
  status public.document_status NOT NULL DEFAULT 'draft',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_with_vat NUMERIC(12,2),
  signature_company TEXT,
  signature_client  TEXT,
  signed_at TIMESTAMPTZ,
  signed_by_name TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read contracts" ON public.contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert contracts" ON public.contracts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update contracts" ON public.contracts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins/managers can delete contracts" ON public.contracts FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'manager'::public.app_role));

CREATE TRIGGER trg_contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assign_contract_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.contract_number IS NULL OR NEW.contract_number = '' THEN
    NEW.contract_number := 'ZML-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.contracts_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_contracts_assign_number BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.assign_contract_number();

CREATE INDEX idx_contracts_reservation ON public.contracts(reservation_id);

CREATE TABLE public.protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  type public.protocol_type NOT NULL,
  protocol_number TEXT UNIQUE,
  status public.document_status NOT NULL DEFAULT 'draft',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_by_name TEXT,
  received_by_name TEXT,
  related_handover_id UUID REFERENCES public.protocols(id) ON DELETE SET NULL,
  notes TEXT,
  signature_company TEXT,
  signature_client TEXT,
  signed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocols TO authenticated;
GRANT ALL ON public.protocols TO service_role;
ALTER TABLE public.protocols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read protocols" ON public.protocols FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert protocols" ON public.protocols FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update protocols" ON public.protocols FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins/managers can delete protocols" ON public.protocols FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role) OR private.has_role(auth.uid(), 'manager'::public.app_role));

CREATE TRIGGER trg_protocols_updated_at BEFORE UPDATE ON public.protocols
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assign_protocol_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_prefix text;
BEGIN
  IF NEW.protocol_number IS NULL OR NEW.protocol_number = '' THEN
    v_prefix := CASE NEW.type WHEN 'handover' THEN 'PR-OD' ELSE 'PR-PR' END;
    NEW.protocol_number := v_prefix || '-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.protocols_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_protocols_assign_number BEFORE INSERT ON public.protocols
  FOR EACH ROW EXECUTE FUNCTION public.assign_protocol_number();

CREATE INDEX idx_protocols_reservation ON public.protocols(reservation_id);
CREATE INDEX idx_protocols_type ON public.protocols(type);

CREATE TABLE public.protocol_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES public.protocols(id) ON DELETE CASCADE,
  furniture_item_id UUID REFERENCES public.furniture_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  item_code TEXT,
  qty_expected INTEGER NOT NULL DEFAULT 0,
  qty_actual INTEGER NOT NULL DEFAULT 0,
  condition public.protocol_item_condition NOT NULL DEFAULT 'ok',
  note TEXT,
  damage_report_id UUID REFERENCES public.damaged_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocol_items TO authenticated;
GRANT ALL ON public.protocol_items TO service_role;
ALTER TABLE public.protocol_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read protocol_items" ON public.protocol_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert protocol_items" ON public.protocol_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update protocol_items" ON public.protocol_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete protocol_items" ON public.protocol_items FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_protocol_items_protocol ON public.protocol_items(protocol_id);
