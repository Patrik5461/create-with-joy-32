-- Personál na akcii sa dá zadať tromi spôsobmi: používateľ z CRM, brigádnik
-- z evidencie helperov, alebo externé meno. Kontrola `reservation_staff_person_ck`
-- však brigádnika nepoznala — vznikla skôr, než pribudli helpery — takže
-- uloženie brigádnika padalo na porušení kontroly a v tabuľke nebol ani jeden
-- záznam.
--
-- Kontrola sa len rozširuje, existujúce riadky sa nemenia ani nemažú.
ALTER TABLE public.reservation_staff DROP CONSTRAINT IF EXISTS reservation_staff_person_ck;

ALTER TABLE public.reservation_staff ADD CONSTRAINT reservation_staff_person_ck CHECK (
  user_id IS NOT NULL
  OR helper_id IS NOT NULL
  OR (external_name IS NOT NULL AND length(btrim(external_name)) > 0)
);
