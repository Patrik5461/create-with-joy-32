-- profiles_select_all_auth je USING (true) pre `authenticated`, takže RLS
-- neobmedzuje riadky — a keďže RLS nevie filtrovať stĺpce, každý prihlásený
-- používateľ si vedel prečítať cudzí ics_token. Ten stačí na stiahnutie
-- kompletného ICS feedu (/api/public/calendar/<token>.ics) so všetkými
-- rezerváciami vrátane kontaktov klientov — teda obísť celý systém oprávnení.
--
-- Riešenie: plošný SELECT/UPDATE na `profiles` nahradiť stĺpcovými grantmi
-- bez ics_token a vlastný token sprístupniť cez úzku SECURITY DEFINER funkciu.

-- 1) SELECT — všetky stĺpce okrem ics_token
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, email, full_name, active, created_at, updated_at,
  username, work_email, phone, job_title
) ON public.profiles TO authenticated;

-- 2) UPDATE — len to, čo klient reálne mení (settings.account.tsx).
--    `active` zámerne nie: mení ho admin cez server funkciu (service_role).
--    `ics_token` tiež nie: rotuje sa cez rotate_my_ics_token().
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, work_email, phone, job_title) ON public.profiles TO authenticated;

-- 3) Vlastný token — jediná cesta, ako sa k nemu klient dostane.
CREATE OR REPLACE FUNCTION public.get_my_ics_token()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ics_token FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_ics_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ics_token() TO authenticated;

-- rotate_my_ics_token() už existuje a je grantovaná `authenticated`; doteraz sa
-- nevyužívala (klient rotoval priamym UPDATE-om). Od tejto migrácie je povinná.
