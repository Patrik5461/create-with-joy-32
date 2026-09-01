-- Rozhodovanie o žiadostiach brigádnikov je vlastná, úzka právomoc — nie to
-- isté ako právo upravovať rezervácie.
--
-- Manažér, ktorý má rezervácie len na čítanie (Ľuboš má `reservations.edit`
-- výslovne odobraté), žiadosti videl, ale Prijať/Odmietnuť mu padalo na
-- právach. Obe rozhodnutia teraz idú cez funkcie, ktoré si právo overia samy,
-- takže na schvaľovanie netreba rozdávať právo meniť rezervácie.
--
-- Funkcie bežia s právami vlastníka, preto si kontrolu robia explicitne;
-- zapisujú len do prihlášok a personálu na akcii, nikam inam.

CREATE OR REPLACE FUNCTION public.can_decide_signups(_uid uuid)
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

CREATE OR REPLACE FUNCTION public.accept_reservation_signup(_signup_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s record; new_staff uuid;
BEGIN
  IF NOT public.can_decide_signups(auth.uid()) THEN
    RAISE EXCEPTION 'Na schvaľovanie žiadostí nemáte právo.';
  END IF;

  SELECT * INTO s FROM public.reservation_signups WHERE id = _signup_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prihláška sa nenašla.';
  END IF;
  IF s.status = 'accepted' AND s.staff_id IS NOT NULL THEN
    RETURN s.staff_id;
  END IF;

  SELECT id INTO new_staff FROM public.reservation_staff
   WHERE reservation_id = s.reservation_id AND helper_id = s.helper_id
   LIMIT 1;

  IF new_staff IS NULL THEN
    INSERT INTO public.reservation_staff (reservation_id, helper_id, created_by)
    VALUES (s.reservation_id, s.helper_id, auth.uid())
    RETURNING id INTO new_staff;
  END IF;

  UPDATE public.reservation_signups
     SET status = 'accepted', decided_by = auth.uid(), decided_at = now(), staff_id = new_staff
   WHERE id = _signup_id;

  RETURN new_staff;
END $$;

CREATE OR REPLACE FUNCTION public.decline_reservation_signup(_signup_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_decide_signups(auth.uid()) THEN
    RAISE EXCEPTION 'Na schvaľovanie žiadostí nemáte právo.';
  END IF;

  UPDATE public.reservation_signups
     SET status = 'declined', decided_by = auth.uid(), decided_at = now()
   WHERE id = _signup_id AND status <> 'accepted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prihláška sa nenašla alebo je už prijatá.';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.can_decide_signups(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_reservation_signup(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_reservation_signup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_decide_signups(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_reservation_signup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_reservation_signup(uuid) TO authenticated;
