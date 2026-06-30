-- Make furniture internal_code generation race-safe.
-- Strategy: take a per-category transaction-scoped advisory lock so concurrent
-- inserts into the same category serialize on code assignment. Plus a retry
-- loop on unique_violation as a defense in depth (covers manual inserts).

CREATE OR REPLACE FUNCTION public.assign_furniture_internal_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_next int;
  v_attempt int := 0;
  v_lock_key bigint;
BEGIN
  IF NEW.internal_code IS NOT NULL AND NEW.internal_code <> '' THEN
    RETURN NEW;
  END IF;

  SELECT upper(code) INTO v_prefix FROM public.furniture_categories WHERE id = NEW.category_id;
  v_prefix := COALESCE(v_prefix, 'ITEM');

  -- Per-category advisory lock (released at end of transaction).
  v_lock_key := hashtextextended('furniture_internal_code:' || v_prefix, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  LOOP
    v_attempt := v_attempt + 1;
    SELECT COALESCE(MAX(NULLIF(substring(internal_code FROM '([0-9]+)$'), '')::int), 0) + 1
      INTO v_next
      FROM public.furniture_items
      WHERE internal_code LIKE v_prefix || '-%';

    NEW.internal_code := v_prefix || '-' || lpad(v_next::text, 4, '0');

    -- If no conflicting row exists, we're done. The unique index still
    -- guards against an unexpected duplicate; in that case we retry.
    IF NOT EXISTS (
      SELECT 1 FROM public.furniture_items WHERE internal_code = NEW.internal_code
    ) THEN
      RETURN NEW;
    END IF;

    IF v_attempt > 50 THEN
      RAISE EXCEPTION 'Nepodarilo sa vygenerovať jedinečný interný kód pre kategóriu %', v_prefix;
    END IF;
  END LOOP;
END
$function$;