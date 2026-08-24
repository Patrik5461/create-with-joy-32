-- Doplnok k 20260824120100_protect_ics_token.sql, odhalený až overením
-- na živej databáze po nasadení.
--
-- 1) rotate_my_ics_token() v databáze vôbec neexistovala, hoci ju
--    settings.calendar.tsx volá. Po zamknutí stĺpca ics_token je jedinou
--    cestou, ako si používateľ vygeneruje nový kalendárový odkaz —
--    bez nej by tlačidlo „Rotovať token" padalo na 404 RPC.
CREATE OR REPLACE FUNCTION public.rotate_my_ics_token()
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
     SET ics_token = gen_random_uuid(),
         updated_at = now()
   WHERE id = auth.uid()
  RETURNING ics_token;
$$;

REVOKE ALL ON FUNCTION public.rotate_my_ics_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_my_ics_token() TO authenticated;

-- 2) has_permission mala okrem `anon` aj grant pre PUBLIC (`=X/postgres`),
--    takže REVOKE ... FROM anon ju sám nezatvoril — anon sa k nej dostal
--    cez PUBLIC. `authenticated` grant zostáva, vyhodnocuje sa v RLS politikách.
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, public.app_permission) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, public.app_permission) TO authenticated;
