-- Personál na akcii môže spravovať aj manažér bez práva upravovať rezervácie.
--
-- Nasadzovanie ľudí na akcie je iná vec než prepisovanie rezervácie: kto tam
-- pôjde, koľkí a či dorazili. Doteraz to viselo na `reservations.edit`, takže
-- manažér, ktorý má rezervácie len na čítanie (Ľuboš), síce videl tlačidlo
-- „Pridať", ale zápis mu padol na právach.
--
-- Rezervácie samotné ostávajú nedotknuté — mení sa len prístup k tabuľke
-- personálu na akcii.

CREATE OR REPLACE FUNCTION public.can_manage_event_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'admin'::app_role)
    OR public.has_role(_uid, 'manager'::app_role)
    OR public.has_permission(_uid, 'reservations.edit'::app_permission)
  );
$$;

-- Rozhodovanie o žiadostiach je tá istá právomoc; necháme jeden zdroj pravdy.
CREATE OR REPLACE FUNCTION public.can_decide_signups(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_event_staff(_uid);
$$;

REVOKE ALL ON FUNCTION public.can_manage_event_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_event_staff(uuid) TO authenticated;

DROP POLICY IF EXISTS rs_insert ON public.reservation_staff;
CREATE POLICY rs_insert ON public.reservation_staff
  FOR INSERT WITH CHECK (can_manage_event_staff(auth.uid()));

DROP POLICY IF EXISTS rs_update ON public.reservation_staff;
CREATE POLICY rs_update ON public.reservation_staff
  FOR UPDATE USING (can_manage_event_staff(auth.uid()));

DROP POLICY IF EXISTS rs_delete ON public.reservation_staff;
CREATE POLICY rs_delete ON public.reservation_staff
  FOR DELETE USING (can_manage_event_staff(auth.uid()));

-- Aby vedel brigádnika aj vybrať zo zoznamu, nielen zapísať.
DROP POLICY IF EXISTS "managers can view helpers" ON public.helpers;
CREATE POLICY "managers can view helpers" ON public.helpers
  FOR SELECT USING (can_manage_event_staff(auth.uid()));
