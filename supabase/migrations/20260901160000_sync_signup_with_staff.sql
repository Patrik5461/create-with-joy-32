-- Prihláška brigádnika a jeho nasadenie na akcii sa musia držať spolu.
--
-- Keď sa brigádnik vymazal z personálu na akcii, prihláška ostala v stave
-- „prijatá" a on stále videl „Potvrdené", hoci už na akciu nešiel. Cudzí kľúč
-- `staff_id` sa síce vynuloval, ale stav nie.
--
-- Opačný smer má rovnaký problém: keď sa brigádnik pridal do personálu ručne,
-- jeho čakajúca prihláška visela ďalej v zozname na schválenie, hoci už bol
-- nasadený.

CREATE OR REPLACE FUNCTION public.sync_signup_with_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.helper_id IS NOT NULL THEN
      UPDATE public.reservation_signups
         SET status = 'accepted',
             staff_id = NEW.id,
             decided_at = COALESCE(decided_at, now())
       WHERE reservation_id = NEW.reservation_id
         AND helper_id = NEW.helper_id
         AND status <> 'accepted';
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE: nasadenie zaniklo, prihláška už nesmie hlásiť „potvrdené".
  -- Beží ako BEFORE, takže `staff_id` ešte ukazuje na mazaný riadok.
  UPDATE public.reservation_signups
     SET status = 'declined', staff_id = NULL, decided_at = now()
   WHERE staff_id = OLD.id AND status = 'accepted';
  RETURN OLD;
END $$;

REVOKE ALL ON FUNCTION public.sync_signup_with_staff() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_staff_accepts_signup ON public.reservation_staff;
CREATE TRIGGER trg_staff_accepts_signup
  AFTER INSERT ON public.reservation_staff
  FOR EACH ROW EXECUTE FUNCTION public.sync_signup_with_staff();

DROP TRIGGER IF EXISTS trg_staff_removal_clears_signup ON public.reservation_staff;
CREATE TRIGGER trg_staff_removal_clears_signup
  BEFORE DELETE ON public.reservation_staff
  FOR EACH ROW EXECUTE FUNCTION public.sync_signup_with_staff();

-- Náprava riadkov, ktoré už v tomto stave uviazli.
UPDATE public.reservation_signups s
   SET status = 'declined', staff_id = NULL, decided_at = now()
 WHERE s.status = 'accepted'
   AND NOT EXISTS (
     SELECT 1 FROM public.reservation_staff st
      WHERE st.reservation_id = s.reservation_id AND st.helper_id = s.helper_id
   );
