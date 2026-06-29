
CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text,
  phone text,
  email text,
  note text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO authenticated;
GRANT ALL ON public.client_contacts TO service_role;

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_contacts_select_auth" ON public.client_contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_contacts_insert_mgr_admin" ON public.client_contacts
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "client_contacts_update_mgr_admin" ON public.client_contacts
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "client_contacts_delete_mgr_admin" ON public.client_contacts
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));

CREATE UNIQUE INDEX client_contacts_one_primary_per_client
  ON public.client_contacts(client_id) WHERE is_primary;

CREATE INDEX client_contacts_client_idx ON public.client_contacts(client_id);

CREATE TRIGGER client_contacts_set_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reservations
  ADD COLUMN contact_id uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL;

ALTER TABLE public.quotes
  ADD COLUMN contact_id uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL;
