
-- =========================================================
-- 1. Permission enum
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.app_permission AS ENUM (
    'warehouse.view','warehouse.edit',
    'reservations.view','reservations.edit',
    'quotes.view','quotes.edit',
    'clients.view','clients.edit',
    'logistics.view','logistics.edit',
    'contracts.view','contracts.edit',
    'maintenance.view','maintenance.edit',
    'attendance.view_all',
    'chat.access',
    'layouts.view','layouts.edit',
    'settings.manage',
    'users.manage'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- 2. user_permissions table (overrides)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission  app_permission NOT NULL,
  granted     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL    ON public.user_permissions TO service_role;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_permissions_read ON public.user_permissions;
CREATE POLICY user_permissions_read ON public.user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Writes go through service_role in server functions; no direct write policy.

-- =========================================================
-- 3. has_permission()
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_permission(_uid uuid, _perm app_permission)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_explicit boolean;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;

  SELECT granted INTO v_explicit
    FROM public.user_permissions
   WHERE user_id = _uid AND permission = _perm;
  IF v_explicit IS NOT NULL THEN RETURN v_explicit; END IF;

  -- role-based defaults
  IF public.has_role(_uid, 'admin'::app_role) THEN
    RETURN true;
  END IF;

  IF public.has_role(_uid, 'manager'::app_role) AND _perm NOT IN (
    'users.manage'::app_permission,
    'settings.manage'::app_permission
  ) THEN
    RETURN true;
  END IF;

  IF public.has_role(_uid, 'warehouse'::app_role) AND _perm IN (
    'warehouse.view'::app_permission,
    'warehouse.edit'::app_permission,
    'reservations.view'::app_permission,
    'maintenance.view'::app_permission,
    'maintenance.edit'::app_permission,
    'chat.access'::app_permission
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END $$;

-- =========================================================
-- 4. RLS rewrite on core tables
-- Admin passes has_permission for every value -> no access loss.
-- =========================================================

-- ---------- QUOTES ----------
DROP POLICY IF EXISTS "auth read quotes" ON public.quotes;
DROP POLICY IF EXISTS quotes_insert_mgr_admin ON public.quotes;
DROP POLICY IF EXISTS quotes_update_mgr_admin ON public.quotes;
DROP POLICY IF EXISTS quotes_delete_admin ON public.quotes;
CREATE POLICY quotes_select ON public.quotes FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'quotes.view'::app_permission));
CREATE POLICY quotes_insert ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'quotes.edit'::app_permission));
CREATE POLICY quotes_update ON public.quotes FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'quotes.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'quotes.edit'::app_permission));
CREATE POLICY quotes_delete ON public.quotes FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'quotes.edit'::app_permission));

-- ---------- QUOTE_ITEMS ----------
DROP POLICY IF EXISTS "auth read quote_items" ON public.quote_items;
DROP POLICY IF EXISTS quote_items_insert_mgr_admin ON public.quote_items;
DROP POLICY IF EXISTS quote_items_update_mgr_admin ON public.quote_items;
DROP POLICY IF EXISTS quote_items_delete_mgr_admin ON public.quote_items;
CREATE POLICY quote_items_select ON public.quote_items FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'quotes.view'::app_permission));
CREATE POLICY quote_items_insert ON public.quote_items FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'quotes.edit'::app_permission));
CREATE POLICY quote_items_update ON public.quote_items FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'quotes.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'quotes.edit'::app_permission));
CREATE POLICY quote_items_delete ON public.quote_items FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'quotes.edit'::app_permission));

-- ---------- RESERVATIONS ----------
DROP POLICY IF EXISTS res_select_auth ON public.reservations;
DROP POLICY IF EXISTS res_insert_mgr_admin ON public.reservations;
DROP POLICY IF EXISTS res_update_all_roles ON public.reservations;
DROP POLICY IF EXISTS res_delete_admin ON public.reservations;
CREATE POLICY res_select ON public.reservations FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'reservations.view'::app_permission));
CREATE POLICY res_insert ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'reservations.edit'::app_permission));
CREATE POLICY res_update ON public.reservations FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'reservations.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'reservations.edit'::app_permission));
CREATE POLICY res_delete ON public.reservations FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'reservations.edit'::app_permission));

-- ---------- RESERVATION_ITEMS ----------
DROP POLICY IF EXISTS ri_select_auth ON public.reservation_items;
DROP POLICY IF EXISTS ri_manage_mgr_admin ON public.reservation_items;
CREATE POLICY ri_select ON public.reservation_items FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'reservations.view'::app_permission));
CREATE POLICY ri_manage ON public.reservation_items FOR ALL TO authenticated
  USING (has_permission(auth.uid(), 'reservations.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'reservations.edit'::app_permission));

-- ---------- RESERVATION_STAFF ----------
DROP POLICY IF EXISTS "Authenticated can read reservation staff" ON public.reservation_staff;
DROP POLICY IF EXISTS "Admin or manager can insert reservation staff" ON public.reservation_staff;
DROP POLICY IF EXISTS "Admin or manager can update reservation staff" ON public.reservation_staff;
DROP POLICY IF EXISTS "Admin or manager can delete reservation staff" ON public.reservation_staff;
CREATE POLICY rs_select ON public.reservation_staff FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'reservations.view'::app_permission));
CREATE POLICY rs_insert ON public.reservation_staff FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'reservations.edit'::app_permission));
CREATE POLICY rs_update ON public.reservation_staff FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'reservations.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'reservations.edit'::app_permission));
CREATE POLICY rs_delete ON public.reservation_staff FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'reservations.edit'::app_permission));

-- ---------- FURNITURE_ITEMS ----------
DROP POLICY IF EXISTS fi_select_auth ON public.furniture_items;
DROP POLICY IF EXISTS fi_insert_wh_admin ON public.furniture_items;
DROP POLICY IF EXISTS fi_update_wh_admin ON public.furniture_items;
DROP POLICY IF EXISTS fi_delete_admin ON public.furniture_items;
CREATE POLICY fi_select ON public.furniture_items FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'warehouse.view'::app_permission));
CREATE POLICY fi_insert ON public.furniture_items FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'warehouse.edit'::app_permission));
CREATE POLICY fi_update ON public.furniture_items FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'warehouse.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'warehouse.edit'::app_permission));
CREATE POLICY fi_delete ON public.furniture_items FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'warehouse.edit'::app_permission));

-- ---------- CLIENTS ----------
DROP POLICY IF EXISTS clients_select_auth ON public.clients;
DROP POLICY IF EXISTS clients_insert_mgr_admin ON public.clients;
DROP POLICY IF EXISTS clients_update_mgr_admin ON public.clients;
DROP POLICY IF EXISTS clients_delete_admin ON public.clients;
CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'clients.view'::app_permission));
CREATE POLICY clients_insert ON public.clients FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'clients.edit'::app_permission));
CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'clients.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'clients.edit'::app_permission));
CREATE POLICY clients_delete ON public.clients FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'clients.edit'::app_permission));

-- ---------- CLIENT_CONTACTS ----------
DROP POLICY IF EXISTS client_contacts_select_auth ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_insert_mgr_admin ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_update_mgr_admin ON public.client_contacts;
DROP POLICY IF EXISTS client_contacts_delete_mgr_admin ON public.client_contacts;
CREATE POLICY cc_select ON public.client_contacts FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'clients.view'::app_permission));
CREATE POLICY cc_insert ON public.client_contacts FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'clients.edit'::app_permission));
CREATE POLICY cc_update ON public.client_contacts FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'clients.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'clients.edit'::app_permission));
CREATE POLICY cc_delete ON public.client_contacts FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'clients.edit'::app_permission));

-- ---------- CONTRACTS ----------
DROP POLICY IF EXISTS "Authenticated can read contracts" ON public.contracts;
DROP POLICY IF EXISTS "Admins/managers can insert contracts" ON public.contracts;
DROP POLICY IF EXISTS "Admins/managers can update contracts" ON public.contracts;
DROP POLICY IF EXISTS "Admins/managers can delete contracts" ON public.contracts;
CREATE POLICY contracts_select ON public.contracts FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'contracts.view'::app_permission));
CREATE POLICY contracts_insert ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'contracts.edit'::app_permission));
CREATE POLICY contracts_update ON public.contracts FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'contracts.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'contracts.edit'::app_permission));
CREATE POLICY contracts_delete ON public.contracts FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'contracts.edit'::app_permission));

-- ---------- PROTOCOLS ----------
DROP POLICY IF EXISTS "Authenticated can read protocols" ON public.protocols;
DROP POLICY IF EXISTS "Staff can insert protocols" ON public.protocols;
DROP POLICY IF EXISTS "Staff can update protocols" ON public.protocols;
DROP POLICY IF EXISTS "Admins/managers can delete protocols" ON public.protocols;
CREATE POLICY protocols_select ON public.protocols FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'contracts.view'::app_permission));
CREATE POLICY protocols_insert ON public.protocols FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'contracts.edit'::app_permission));
CREATE POLICY protocols_update ON public.protocols FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'contracts.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'contracts.edit'::app_permission));
CREATE POLICY protocols_delete ON public.protocols FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'contracts.edit'::app_permission));

-- ---------- PROTOCOL_ITEMS ----------
DROP POLICY IF EXISTS "Authenticated can read protocol_items" ON public.protocol_items;
DROP POLICY IF EXISTS "Staff can insert protocol_items" ON public.protocol_items;
DROP POLICY IF EXISTS "Staff can update protocol_items" ON public.protocol_items;
DROP POLICY IF EXISTS "Staff can delete protocol_items" ON public.protocol_items;
CREATE POLICY pi_select ON public.protocol_items FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'contracts.view'::app_permission));
CREATE POLICY pi_insert ON public.protocol_items FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'contracts.edit'::app_permission));
CREATE POLICY pi_update ON public.protocol_items FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'contracts.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'contracts.edit'::app_permission));
CREATE POLICY pi_delete ON public.protocol_items FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'contracts.edit'::app_permission));

-- ---------- LOGISTICS ----------
DROP POLICY IF EXISTS log_select_auth ON public.logistics;
DROP POLICY IF EXISTS log_manage ON public.logistics;
CREATE POLICY log_select ON public.logistics FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'logistics.view'::app_permission));
CREATE POLICY log_manage ON public.logistics FOR ALL TO authenticated
  USING (has_permission(auth.uid(), 'logistics.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'logistics.edit'::app_permission));

-- ---------- LOGISTICS_SURVEYS ----------
DROP POLICY IF EXISTS "Authenticated staff can view surveys" ON public.logistics_surveys;
DROP POLICY IF EXISTS surveys_manage ON public.logistics_surveys;
CREATE POLICY surveys_select ON public.logistics_surveys FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'logistics.view'::app_permission));
CREATE POLICY surveys_manage ON public.logistics_surveys FOR ALL TO authenticated
  USING (has_permission(auth.uid(), 'logistics.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'logistics.edit'::app_permission));

-- ---------- LAYOUT_TEMPLATES ----------
DROP POLICY IF EXISTS "authenticated read layout templates" ON public.layout_templates;
DROP POLICY IF EXISTS "admin/manager insert layout templates" ON public.layout_templates;
DROP POLICY IF EXISTS "admin/manager update layout templates" ON public.layout_templates;
DROP POLICY IF EXISTS "admin/manager delete layout templates" ON public.layout_templates;
CREATE POLICY lt_select ON public.layout_templates FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'layouts.view'::app_permission));
CREATE POLICY lt_insert ON public.layout_templates FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'layouts.edit'::app_permission));
CREATE POLICY lt_update ON public.layout_templates FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'layouts.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'layouts.edit'::app_permission));
CREATE POLICY lt_delete ON public.layout_templates FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'layouts.edit'::app_permission));

-- ---------- DAMAGED_ITEMS ----------
DROP POLICY IF EXISTS di_select_auth ON public.damaged_items;
DROP POLICY IF EXISTS di_manage_wh_admin ON public.damaged_items;
CREATE POLICY di_select ON public.damaged_items FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'maintenance.view'::app_permission));
CREATE POLICY di_manage ON public.damaged_items FOR ALL TO authenticated
  USING (has_permission(auth.uid(), 'maintenance.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'maintenance.edit'::app_permission));

-- ---------- INQUIRIES ----------
DROP POLICY IF EXISTS "Authenticated can view inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated can update inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Admins/managers can insert inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Admins/managers can delete inquiries" ON public.inquiries;
CREATE POLICY inq_select ON public.inquiries FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'reservations.view'::app_permission));
CREATE POLICY inq_insert ON public.inquiries FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'reservations.edit'::app_permission));
CREATE POLICY inq_update ON public.inquiries FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'reservations.edit'::app_permission))
  WITH CHECK (has_permission(auth.uid(), 'reservations.edit'::app_permission));
CREATE POLICY inq_delete ON public.inquiries FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'reservations.edit'::app_permission));

-- =========================================================
-- 5. updated_at trigger for user_permissions
-- =========================================================
DROP TRIGGER IF EXISTS user_permissions_touch ON public.user_permissions;
CREATE TRIGGER user_permissions_touch
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
