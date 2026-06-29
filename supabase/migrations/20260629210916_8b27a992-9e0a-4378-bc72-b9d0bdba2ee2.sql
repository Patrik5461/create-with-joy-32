
-- 1. Recreate the reservation_status enum with the new lifecycle order
ALTER TYPE public.reservation_status RENAME TO reservation_status_old;

CREATE TYPE public.reservation_status AS ENUM (
  'inquiry', 'quote', 'confirmed', 'in_progress', 'returned', 'invoiced', 'cancelled'
);

ALTER TABLE public.reservations ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.reservations
  ALTER COLUMN status TYPE public.reservation_status
  USING (
    CASE status::text
      WHEN 'prepared'  THEN 'confirmed'
      WHEN 'loaded'    THEN 'confirmed'
      WHEN 'delivered' THEN 'in_progress'
      ELSE status::text
    END::public.reservation_status
  );
ALTER TABLE public.reservations ALTER COLUMN status SET DEFAULT 'inquiry'::public.reservation_status;

DROP TYPE public.reservation_status_old;

-- 2. Status history table
CREATE TABLE public.reservation_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  from_status public.reservation_status,
  to_status public.reservation_status NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.reservation_status_history TO authenticated;
GRANT ALL ON public.reservation_status_history TO service_role;

ALTER TABLE public.reservation_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read status history"
  ON public.reservation_status_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert status history"
  ON public.reservation_status_history FOR INSERT
  TO authenticated
  WITH CHECK (changed_by = auth.uid() OR changed_by IS NULL);

CREATE INDEX idx_reservation_status_history_res ON public.reservation_status_history(reservation_id, created_at DESC);

-- 3. Trigger logging status changes
CREATE OR REPLACE FUNCTION public.log_reservation_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.reservation_status_history (reservation_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.reservation_status_history (reservation_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reservation_status_history ON public.reservations;
CREATE TRIGGER trg_reservation_status_history
  AFTER INSERT OR UPDATE OF status ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.log_reservation_status_change();

-- 4. Auto-advance inquiry → quote when a quote is created for a reservation
CREATE OR REPLACE FUNCTION public.auto_advance_reservation_on_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reservation_id IS NOT NULL THEN
    UPDATE public.reservations
       SET status = 'quote'::public.reservation_status
     WHERE id = NEW.reservation_id
       AND status = 'inquiry'::public.reservation_status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_quote_advances_reservation ON public.quotes;
CREATE TRIGGER trg_quote_advances_reservation
  AFTER INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.auto_advance_reservation_on_quote();
