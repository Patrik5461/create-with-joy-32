
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1) helpers table
CREATE TABLE public.helpers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pin_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX helpers_name_key ON public.helpers (lower(name)) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.helpers TO authenticated;
GRANT ALL ON public.helpers TO service_role;

ALTER TABLE public.helpers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage helpers"
  ON public.helpers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "managers can view helpers"
  ON public.helpers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER helpers_set_updated_at
  BEFORE UPDATE ON public.helpers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) attendance columns
ALTER TABLE public.attendance
  ADD COLUMN helper_id uuid REFERENCES public.helpers(id) ON DELETE SET NULL,
  ADD COLUMN is_helper boolean NOT NULL DEFAULT false;

ALTER TABLE public.attendance ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_owner_chk
  CHECK ((user_id IS NOT NULL) OR (helper_id IS NOT NULL));

CREATE INDEX attendance_helper_id_idx ON public.attendance (helper_id) WHERE helper_id IS NOT NULL;

-- 3) verify_helper_pin
CREATE OR REPLACE FUNCTION public.verify_helper_pin(_helper_id uuid, _pin text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_hash text; v_active boolean; v_expected text;
BEGIN
  SELECT pin_hash, is_active INTO v_hash, v_active
  FROM public.helpers WHERE id = _helper_id;
  IF v_hash IS NULL OR NOT v_active THEN RETURN NULL; END IF;
  v_expected := 'sha256:' || encode(extensions.digest(_pin || ':' || _helper_id::text, 'sha256'), 'hex');
  IF v_expected = v_hash THEN RETURN _helper_id; ELSE RETURN NULL; END IF;
END $$;

REVOKE ALL ON FUNCTION public.verify_helper_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_helper_pin(uuid, text) TO service_role;

-- hash helper (used from server via service role to hash new PINs)
CREATE OR REPLACE FUNCTION public.hash_helper_pin(_helper_id uuid, _pin text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT 'sha256:' || encode(extensions.digest(_pin || ':' || _helper_id::text, 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION public.hash_helper_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hash_helper_pin(uuid, text) TO service_role;

-- 4) helper_punch
CREATE OR REPLACE FUNCTION public.helper_punch(_helper_id uuid, _action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active boolean;
  v_open_id uuid;
  v_row public.attendance;
BEGIN
  SELECT is_active INTO v_active FROM public.helpers WHERE id = _helper_id;
  IF NOT COALESCE(v_active, false) THEN
    RAISE EXCEPTION 'Helper is not active';
  END IF;

  SELECT id INTO v_open_id FROM public.attendance
    WHERE helper_id = _helper_id AND clock_out IS NULL
    ORDER BY clock_in DESC LIMIT 1;

  IF _action = 'start' THEN
    IF v_open_id IS NOT NULL THEN RAISE EXCEPTION 'Already clocked in'; END IF;
    INSERT INTO public.attendance (helper_id, is_helper, source)
    VALUES (_helper_id, true, 'helper_pin')
    RETURNING * INTO v_row;
    RETURN to_jsonb(v_row);
  ELSIF _action = 'end' THEN
    IF v_open_id IS NULL THEN RAISE EXCEPTION 'Not clocked in'; END IF;
    UPDATE public.attendance SET clock_out = now(), updated_at = now()
      WHERE id = v_open_id RETURNING * INTO v_row;
    RETURN to_jsonb(v_row);
  ELSE
    RAISE EXCEPTION 'Unknown action: %', _action;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.helper_punch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_punch(uuid, text) TO service_role;

-- 5) helper_status
CREATE OR REPLACE FUNCTION public.helper_status(_helper_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_open public.attendance; v_name text;
BEGIN
  SELECT name INTO v_name FROM public.helpers WHERE id = _helper_id;
  SELECT * INTO v_open FROM public.attendance
    WHERE helper_id = _helper_id AND clock_out IS NULL
    ORDER BY clock_in DESC LIMIT 1;
  RETURN jsonb_build_object(
    'name', v_name,
    'open', CASE WHEN v_open.id IS NULL THEN NULL ELSE to_jsonb(v_open) END
  );
END $$;

REVOKE ALL ON FUNCTION public.helper_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_status(uuid) TO service_role;
