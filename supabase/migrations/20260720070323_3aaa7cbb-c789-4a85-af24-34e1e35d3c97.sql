-- Allow reservations without a linked client (quick contact mode).
-- client_id is already nullable; add CHECK to require either client_id or contact_person.
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_client_or_contact_chk;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_client_or_contact_chk
  CHECK (client_id IS NOT NULL OR (contact_person IS NOT NULL AND btrim(contact_person) <> ''));