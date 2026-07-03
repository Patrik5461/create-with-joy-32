
-- Soften hard block: convert validation triggers into no-ops so overbooking is allowed.
CREATE OR REPLACE FUNCTION public.validate_reservation_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.revalidate_reservation_on_time_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN NEW;
END;
$$;

-- Helper for the UI: return which reservations (from a given set) are overbooked.
CREATE OR REPLACE FUNCTION public.overbooked_reservation_ids(_ids uuid[])
RETURNS TABLE(reservation_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT DISTINCT r.id
  FROM public.reservations r
  JOIN public.reservation_items ri ON ri.reservation_id = r.id
  CROSS JOIN LATERAL public.check_item_availability(ri.furniture_item_id, r.load_at, r.available_from_at, r.id) a
  WHERE r.id = ANY(_ids)
    AND r.status <> 'cancelled'
    AND ri.qty > a.available;
$$;

GRANT EXECUTE ON FUNCTION public.overbooked_reservation_ids(uuid[]) TO authenticated;
