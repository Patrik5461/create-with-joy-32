
-- layout_templates table
CREATE TABLE public.layout_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  data jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.layout_templates TO authenticated;
GRANT ALL ON public.layout_templates TO service_role;

ALTER TABLE public.layout_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read layout templates"
  ON public.layout_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin/manager insert layout templates"
  ON public.layout_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "admin/manager update layout templates"
  ON public.layout_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "admin/manager delete layout templates"
  ON public.layout_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER layout_templates_set_updated_at
  BEFORE UPDATE ON public.layout_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policies for layout-backgrounds bucket
CREATE POLICY "authenticated read layout backgrounds"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'layout-backgrounds');

CREATE POLICY "authenticated upload layout backgrounds"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'layout-backgrounds');

CREATE POLICY "authenticated update layout backgrounds"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'layout-backgrounds');

CREATE POLICY "authenticated delete layout backgrounds"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'layout-backgrounds');
