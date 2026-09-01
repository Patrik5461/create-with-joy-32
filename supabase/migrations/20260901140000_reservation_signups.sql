-- Prihlášky brigádnikov na akcie.
--
-- Zámerne oddelené od `reservation_staff`, kde je skutočný plán nasadenia:
-- „chcel by som ísť" a „máš tam byť" sú dve rôzne veci a keby si brigádnici
-- zapisovali rovno do personálu, prestalo by sa to dať rozoznať. Prihláška sa
-- na nasadenie zmení až vtedy, keď ju niekto z CRM prijme.
--
-- Brigádnici nie sú používatelia databázy — na `/helper` majú PIN a podpísaný
-- token, takže k tejto tabuľke pristupujú výhradne cez serverové funkcie
-- (service role). Politiky nižšie sú preto len pre prihlásených v CRM.

CREATE TABLE IF NOT EXISTS public.reservation_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  helper_id uuid NOT NULL REFERENCES public.helpers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  note text,
  -- Kto o prihláške rozhodol a kedy; `staff_id` ukazuje na vzniknuté nasadenie.
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  staff_id uuid REFERENCES public.reservation_staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_signups_status_ck CHECK (status IN ('pending', 'accepted', 'declined')),
  -- Na jednu akciu sa ten istý brigádnik hlási raz.
  CONSTRAINT reservation_signups_unique UNIQUE (reservation_id, helper_id)
);

CREATE INDEX IF NOT EXISTS reservation_signups_reservation_idx ON public.reservation_signups (reservation_id);
CREATE INDEX IF NOT EXISTS reservation_signups_helper_idx ON public.reservation_signups (helper_id);
CREATE INDEX IF NOT EXISTS reservation_signups_status_idx ON public.reservation_signups (status);

DROP TRIGGER IF EXISTS trg_reservation_signups_updated_at ON public.reservation_signups;
CREATE TRIGGER trg_reservation_signups_updated_at
  BEFORE UPDATE ON public.reservation_signups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reservation_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rsg_select ON public.reservation_signups;
CREATE POLICY rsg_select ON public.reservation_signups
  FOR SELECT USING (has_permission(auth.uid(), 'reservations.view'::app_permission));

DROP POLICY IF EXISTS rsg_insert ON public.reservation_signups;
CREATE POLICY rsg_insert ON public.reservation_signups
  FOR INSERT WITH CHECK (has_permission(auth.uid(), 'reservations.edit'::app_permission));

DROP POLICY IF EXISTS rsg_update ON public.reservation_signups;
CREATE POLICY rsg_update ON public.reservation_signups
  FOR UPDATE USING (has_permission(auth.uid(), 'reservations.edit'::app_permission));

DROP POLICY IF EXISTS rsg_delete ON public.reservation_signups;
CREATE POLICY rsg_delete ON public.reservation_signups
  FOR DELETE USING (has_permission(auth.uid(), 'reservations.edit'::app_permission));
