CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT '',
  address TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  ico TEXT,
  dic TEXT,
  ic_dph TEXT,
  iban TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read company settings"
  ON public.company_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert company settings"
  ON public.company_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update company settings"
  ON public.company_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete company settings"
  ON public.company_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER company_settings_set_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.company_settings (company_name, address, contact_person, phone, email)
VALUES ('Mima Production s.r.o.', 'Martinčekova 18, 821 09 Bratislava', 'Marek Mariš', '+421 904 700 229', 'marek@mimapro.sk');