-- Tri operácie, ktoré doteraz bežali ako viac samostatných dopytov z prehliadača
-- a pri zlyhaní v polovici nechali dáta v nezmyselnom stave. Tu sú ako jedna
-- transakcia — buď prejde všetko, alebo sa nezmení nič.
--
-- Nič nemažú nad rámec toho, čo mazali doteraz; `soft_delete_quote` je len
-- presun do koša (deleted_at), nie skutočné mazanie.

-- 1) Prepnutie aktuálnej verzie kalkulácie.
--    Partial unique index `quotes_group_current_uidx` dovolí len jednu verziu
--    s is_current na skupinu, takže poradie dvoch UPDATE-ov rozhoduje. Keď to
--    robil prehliadač na dvakrát a druhý dopyt zlyhal, skupina zostala bez
--    aktuálnej verzie a kalkulácia zmizla zo zoznamu aj z koša.
CREATE OR REPLACE FUNCTION public.set_current_quote_version(_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE gid uuid;
BEGIN
  SELECT quote_group_id INTO gid FROM public.quotes WHERE id = _quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kalkulácia sa nenašla.';
  END IF;

  IF gid IS NOT NULL THEN
    UPDATE public.quotes
       SET is_current = false
     WHERE quote_group_id = gid AND id <> _quote_id AND is_current;
  END IF;

  UPDATE public.quotes SET is_current = true WHERE id = _quote_id AND NOT is_current;
END $$;

-- 2) Presun verzie kalkulácie do koša + povýšenie najnovšej zostávajúcej.
--    Zmazaná verzia musí stratiť príznak „aktuálna" v tom istom kroku, inak
--    unique index povýšenie zablokuje. Vracia id verzie, ktorá sa stala
--    aktuálnou (NULL, keď v skupine už nič nezostalo).
CREATE OR REPLACE FUNCTION public.soft_delete_quote(_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE gid uuid; was_current boolean; next_id uuid;
BEGIN
  SELECT quote_group_id, is_current INTO gid, was_current
    FROM public.quotes WHERE id = _quote_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kalkulácia sa nenašla alebo už je v koši.';
  END IF;

  UPDATE public.quotes
     SET deleted_at = now(), deleted_by = auth.uid(), is_current = false
   WHERE id = _quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kalkuláciu sa nepodarilo presunúť do koša.';
  END IF;

  IF was_current AND gid IS NOT NULL THEN
    SELECT id INTO next_id FROM public.quotes
     WHERE quote_group_id = gid AND deleted_at IS NULL
     ORDER BY version_number DESC LIMIT 1;
    IF next_id IS NOT NULL THEN
      UPDATE public.quotes SET is_current = true WHERE id = next_id;
    END IF;
  END IF;

  RETURN next_id;
END $$;

-- 3) Prepis položiek rezervácie. Doteraz sa najprv zmazali a až potom vkladali
--    nové; keď vloženie zlyhalo, rezervácia ostala prázdna a tovar sa ticho
--    uvoľnil. V transakcii sa pri chybe vrátia pôvodné položky.
CREATE OR REPLACE FUNCTION public.replace_reservation_items(_reservation_id uuid, _items jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE inserted integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.reservations WHERE id = _reservation_id) THEN
    RAISE EXCEPTION 'Rezervácia sa nenašla.';
  END IF;

  DELETE FROM public.reservation_items WHERE reservation_id = _reservation_id;

  INSERT INTO public.reservation_items (reservation_id, furniture_item_id, qty)
  SELECT _reservation_id,
         (i->>'furniture_item_id')::uuid,
         GREATEST(1, round((i->>'qty')::numeric)::int)
    FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) AS i
   WHERE NULLIF(i->>'furniture_item_id', '') IS NOT NULL
     AND COALESCE((i->>'qty')::numeric, 0) > 0;
  GET DIAGNOSTICS inserted = ROW_COUNT;

  RETURN inserted;
END $$;

-- Funkcie bežia s právami volajúceho, takže platia rovnaké RLS politiky ako
-- pri priamom zápise (quotes.edit / reservations.edit).
REVOKE ALL ON FUNCTION public.set_current_quote_version(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_quote(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_reservation_items(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_current_quote_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_quote(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_reservation_items(uuid, jsonb) TO authenticated;
