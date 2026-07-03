-- Email settings & send log
CREATE TABLE IF NOT EXISTS public.email_settings (
  id integer PRIMARY KEY DEFAULT 1,
  from_email text NOT NULL DEFAULT 'noreply@send.mimapro.sk',
  from_name text NOT NULL DEFAULT 'Mima Production',
  reply_to_email text,
  notification_recipients text[] NOT NULL DEFAULT '{}'::text[],
  quote_subject_template text NOT NULL DEFAULT 'Cenová ponuka {{quote_number}}',
  survey_link_subject_template text NOT NULL DEFAULT 'Logistický dotazník k akcii {{event_name}}',
  inquiry_notify_subject_template text NOT NULL DEFAULT 'Nový dopyt z katalógu — {{name}}',
  survey_filled_subject_template text NOT NULL DEFAULT 'Logistický dotazník vyplnený — {{event_name}}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_settings_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_settings TO authenticated;
GRANT ALL ON public.email_settings TO service_role;

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_settings_admin_all" ON public.email_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER email_settings_set_updated_at
  BEFORE UPDATE ON public.email_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.email_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Email send log
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL,
  error_message text,
  provider_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_send_log TO authenticated;
GRANT ALL ON public.email_send_log TO service_role;

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_send_log_admin_select" ON public.email_send_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS email_send_log_created_at_idx ON public.email_send_log (created_at DESC);