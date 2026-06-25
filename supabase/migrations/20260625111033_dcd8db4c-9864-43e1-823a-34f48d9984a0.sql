
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ics_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS profiles_ics_token_key ON public.profiles(ics_token);

-- Allow user to regenerate their own token via update; existing UPDATE policy on profiles already covers self.

-- Helper to rotate token
CREATE OR REPLACE FUNCTION public.rotate_my_ics_token()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_new uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_new := gen_random_uuid();
  UPDATE public.profiles SET ics_token = v_new WHERE id = auth.uid();
  RETURN v_new;
END $$;

REVOKE ALL ON FUNCTION public.rotate_my_ics_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_my_ics_token() TO authenticated;
