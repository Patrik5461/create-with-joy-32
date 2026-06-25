
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'warehouse');
CREATE TYPE public.reservation_status AS ENUM (
  'inquiry', 'confirmed', 'prepared', 'loaded', 'delivered', 'in_progress', 'returned', 'cancelled'
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- USER_ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "profiles_select_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_select_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- CLIENTS
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  ico TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "clients_select_auth" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_insert_mgr_admin" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "clients_update_mgr_admin" ON public.clients FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "clients_delete_admin" ON public.clients FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- FURNITURE CATEGORIES
CREATE TABLE public.furniture_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.furniture_categories TO authenticated;
GRANT ALL ON public.furniture_categories TO service_role;
ALTER TABLE public.furniture_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fc_select_auth" ON public.furniture_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "fc_admin_manage" ON public.furniture_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.furniture_categories (code, name, display_order) VALUES
  ('tables','Stoly',1),('chairs','Stoličky',2),('lounge','Lounge nábytok',3),('bars','Bary',4),
  ('decor','Dekorácie',5),('lighting','Osvetlenie',6),('accessories','Doplnky',7),('other','Ostatné',8);

-- FURNITURE ITEMS
CREATE TABLE public.furniture_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.furniture_categories(id),
  photo_url TEXT,
  internal_code TEXT NOT NULL UNIQUE,
  dimensions TEXT,
  color TEXT,
  note TEXT,
  total_qty INT NOT NULL DEFAULT 0 CHECK (total_qty >= 0),
  damaged_qty INT NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
  retired_qty INT NOT NULL DEFAULT 0 CHECK (retired_qty >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.furniture_items TO authenticated;
GRANT ALL ON public.furniture_items TO service_role;
ALTER TABLE public.furniture_items ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fi_updated BEFORE UPDATE ON public.furniture_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "fi_select_auth" ON public.furniture_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "fi_insert_wh_admin" ON public.furniture_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'));
CREATE POLICY "fi_update_wh_admin" ON public.furniture_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'));
CREATE POLICY "fi_delete_admin" ON public.furniture_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- RESERVATIONS
CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  event_name TEXT NOT NULL,
  venue TEXT,
  address TEXT,
  note TEXT,
  status public.reservation_status NOT NULL DEFAULT 'inquiry',
  load_at TIMESTAMPTZ NOT NULL,
  depart_at TIMESTAMPTZ NOT NULL,
  event_start_at TIMESTAMPTZ NOT NULL,
  event_end_at TIMESTAMPTZ NOT NULL,
  return_at TIMESTAMPTZ NOT NULL,
  available_from_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_res_updated BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_res_times ON public.reservations (load_at, available_from_at);
CREATE INDEX idx_res_status ON public.reservations (status);

CREATE POLICY "res_select_auth" ON public.reservations FOR SELECT TO authenticated USING (true);
CREATE POLICY "res_insert_mgr_admin" ON public.reservations FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "res_update_all_roles" ON public.reservations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'warehouse')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'warehouse'));
CREATE POLICY "res_delete_admin" ON public.reservations FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- RESERVATION_ITEMS
CREATE TABLE public.reservation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  furniture_item_id UUID NOT NULL REFERENCES public.furniture_items(id),
  qty INT NOT NULL CHECK (qty > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_items TO authenticated;
GRANT ALL ON public.reservation_items TO service_role;
ALTER TABLE public.reservation_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ri_res ON public.reservation_items (reservation_id);
CREATE INDEX idx_ri_item ON public.reservation_items (furniture_item_id);

CREATE POLICY "ri_select_auth" ON public.reservation_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "ri_manage_mgr_admin" ON public.reservation_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- LOGISTICS
CREATE TABLE public.logistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  load_time TIMESTAMPTZ,
  unload_time TIMESTAMPTZ,
  return_time TIMESTAMPTZ,
  internal_note TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics TO authenticated;
GRANT ALL ON public.logistics TO service_role;
ALTER TABLE public.logistics ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_log_updated BEFORE UPDATE ON public.logistics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "log_select_auth" ON public.logistics FOR SELECT TO authenticated USING (true);
CREATE POLICY "log_manage" ON public.logistics FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'warehouse')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'warehouse'));

-- DAMAGED_ITEMS
CREATE TABLE public.damaged_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  furniture_item_id UUID NOT NULL REFERENCES public.furniture_items(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  qty INT NOT NULL CHECK (qty > 0),
  reason TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.damaged_items TO authenticated;
GRANT ALL ON public.damaged_items TO service_role;
ALTER TABLE public.damaged_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "di_select_auth" ON public.damaged_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "di_manage_wh_admin" ON public.damaged_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'warehouse'));

-- AVAILABILITY FN
CREATE OR REPLACE FUNCTION public.check_item_availability(
  _item_id UUID, _from TIMESTAMPTZ, _to TIMESTAMPTZ, _exclude_reservation UUID DEFAULT NULL
) RETURNS TABLE(total INT, damaged INT, retired INT, reserved INT, available INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- AVAILABILITY TRIGGERS
CREATE OR REPLACE FUNCTION public.validate_reservation_items()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res RECORD; v_avail RECORD; v_item_name TEXT;
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = NEW.reservation_id;
  IF v_res IS NULL OR v_res.status = 'cancelled' THEN RETURN NEW; END IF;
  SELECT * INTO v_avail FROM public.check_item_availability(NEW.furniture_item_id, v_res.load_at, v_res.available_from_at, v_res.id);
  IF (v_avail.available - NEW.qty) < 0 THEN
    SELECT name INTO v_item_name FROM public.furniture_items WHERE id = NEW.furniture_item_id;
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Nie je dostupný dostatočný počet kusov v zvolenom čase (%). Voľné: %, požadované: %.',
      v_item_name, v_avail.available, NEW.qty USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_reservation_items
  BEFORE INSERT OR UPDATE ON public.reservation_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_reservation_items();

CREATE OR REPLACE FUNCTION public.revalidate_reservation_on_time_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_avail RECORD; v_item_name TEXT;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF (TG_OP = 'UPDATE') AND (OLD.load_at = NEW.load_at) AND (OLD.available_from_at = NEW.available_from_at) AND (OLD.status = NEW.status) THEN RETURN NEW; END IF;
  FOR r IN SELECT * FROM public.reservation_items WHERE reservation_id = NEW.id LOOP
    SELECT * INTO v_avail FROM public.check_item_availability(r.furniture_item_id, NEW.load_at, NEW.available_from_at, NEW.id);
    IF (v_avail.available - r.qty) < 0 THEN
      SELECT name INTO v_item_name FROM public.furniture_items WHERE id = r.furniture_item_id;
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Nie je dostupný dostatočný počet kusov v zvolenom čase (%). Voľné: %, požadované: %.',
        v_item_name, v_avail.available, r.qty USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_revalidate_reservation
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.revalidate_reservation_on_time_change();
