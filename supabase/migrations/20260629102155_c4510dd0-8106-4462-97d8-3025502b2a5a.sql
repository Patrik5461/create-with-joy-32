
CREATE OR REPLACE FUNCTION public.assign_furniture_internal_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_prefix text;
  v_next int;
BEGIN
  IF NEW.internal_code IS NULL OR NEW.internal_code = '' THEN
    SELECT upper(code) INTO v_prefix FROM public.furniture_categories WHERE id = NEW.category_id;
    v_prefix := COALESCE(v_prefix, 'ITEM');
    SELECT COALESCE(MAX(NULLIF(substring(internal_code FROM '([0-9]+)$'), '')::int), 0) + 1
      INTO v_next
      FROM public.furniture_items
      WHERE internal_code LIKE v_prefix || '-%';
    NEW.internal_code := v_prefix || '-' || lpad(v_next::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_furniture_internal_code ON public.furniture_items;
CREATE TRIGGER trg_assign_furniture_internal_code
BEFORE INSERT ON public.furniture_items
FOR EACH ROW EXECUTE FUNCTION public.assign_furniture_internal_code();
