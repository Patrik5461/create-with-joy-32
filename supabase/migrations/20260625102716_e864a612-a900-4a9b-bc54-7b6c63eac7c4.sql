
-- 1) Move has_role into a private schema so PostgREST does not expose it.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) Recreate every policy that referenced public.has_role to use private.has_role.
-- profiles
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- user_roles
DROP POLICY IF EXISTS user_roles_admin_manage ON public.user_roles;
CREATE POLICY user_roles_admin_manage ON public.user_roles
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- clients
DROP POLICY IF EXISTS clients_insert_mgr_admin ON public.clients;
CREATE POLICY clients_insert_mgr_admin ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS clients_update_mgr_admin ON public.clients;
CREATE POLICY clients_update_mgr_admin ON public.clients
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager'))
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS clients_delete_admin ON public.clients;
CREATE POLICY clients_delete_admin ON public.clients
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- furniture_categories
DROP POLICY IF EXISTS fc_admin_manage ON public.furniture_categories;
CREATE POLICY fc_admin_manage ON public.furniture_categories
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- furniture_items
DROP POLICY IF EXISTS fi_insert_wh_admin ON public.furniture_items;
CREATE POLICY fi_insert_wh_admin ON public.furniture_items
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'warehouse'));
DROP POLICY IF EXISTS fi_update_wh_admin ON public.furniture_items;
CREATE POLICY fi_update_wh_admin ON public.furniture_items
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'warehouse'))
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'warehouse'));
DROP POLICY IF EXISTS fi_delete_admin ON public.furniture_items;
CREATE POLICY fi_delete_admin ON public.furniture_items
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- reservations
DROP POLICY IF EXISTS res_insert_mgr_admin ON public.reservations;
CREATE POLICY res_insert_mgr_admin ON public.reservations
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager'));
DROP POLICY IF EXISTS res_update_all_roles ON public.reservations;
CREATE POLICY res_update_all_roles ON public.reservations
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager') OR private.has_role(auth.uid(), 'warehouse'))
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager') OR private.has_role(auth.uid(), 'warehouse'));
DROP POLICY IF EXISTS res_delete_admin ON public.reservations;
CREATE POLICY res_delete_admin ON public.reservations
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- reservation_items
DROP POLICY IF EXISTS ri_manage_mgr_admin ON public.reservation_items;
CREATE POLICY ri_manage_mgr_admin ON public.reservation_items
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager'))
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager'));

-- logistics
DROP POLICY IF EXISTS log_manage ON public.logistics;
CREATE POLICY log_manage ON public.logistics
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager') OR private.has_role(auth.uid(), 'warehouse'))
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager') OR private.has_role(auth.uid(), 'warehouse'));

-- damaged_items
DROP POLICY IF EXISTS di_manage_wh_admin ON public.damaged_items;
CREATE POLICY di_manage_wh_admin ON public.damaged_items
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'warehouse'))
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'warehouse'));

-- storage.objects (furniture-photos bucket)
DROP POLICY IF EXISTS "Admin/Warehouse upload furniture photos" ON storage.objects;
CREATE POLICY "Admin/Warehouse upload furniture photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'furniture-photos' AND (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'warehouse')));
DROP POLICY IF EXISTS "Admin/Warehouse update furniture photos" ON storage.objects;
CREATE POLICY "Admin/Warehouse update furniture photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'furniture-photos' AND (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'warehouse')));
DROP POLICY IF EXISTS "Admin/Warehouse delete furniture photos" ON storage.objects;
CREATE POLICY "Admin/Warehouse delete furniture photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'furniture-photos' AND (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'warehouse')));

-- 3) Drop the public has_role now that no policy references it.
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 4) Convert check_item_availability to SECURITY INVOKER so it runs with the
--    caller's privileges (RLS on furniture_items/reservations/reservation_items
--    already permits authenticated SELECT).
CREATE OR REPLACE FUNCTION public.check_item_availability(
  _item_id uuid, _from timestamptz, _to timestamptz, _exclude_reservation uuid DEFAULT NULL
)
RETURNS TABLE(total integer, damaged integer, retired integer, reserved integer, available integer)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_total INT; v_damaged INT; v_retired INT; v_reserved INT;
BEGIN
  SELECT total_qty, damaged_qty, retired_qty INTO v_total, v_damaged, v_retired
  FROM public.furniture_items WHERE id = _item_id;
  IF v_total IS NULL THEN RETURN QUERY SELECT 0,0,0,0,0; RETURN; END IF;
  SELECT COALESCE(SUM(ri.qty),0) INTO v_reserved
  FROM public.reservation_items ri
  JOIN public.reservations r ON r.id = ri.reservation_id
  WHERE ri.furniture_item_id = _item_id
    AND r.status <> 'cancelled'
    AND (_exclude_reservation IS NULL OR r.id <> _exclude_reservation)
    AND r.load_at < _to AND r.available_from_at > _from;
  RETURN QUERY SELECT v_total, v_damaged, v_retired, v_reserved, (v_total - v_damaged - v_retired - v_reserved);
END; $$;

REVOKE ALL ON FUNCTION public.check_item_availability(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_item_availability(uuid, timestamptz, timestamptz, uuid) TO authenticated;
