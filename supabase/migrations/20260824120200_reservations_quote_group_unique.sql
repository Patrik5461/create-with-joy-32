-- Detail kalkulácie načítava naviazanú rezerváciu cez
--   .eq("quote_group_id", gid).maybeSingle()
-- čo predpokladá najviac jednu rezerváciu na skupinu kalkulácií. Dvojklik na
-- „Vytvoriť rezerváciu" alebo súbeh vedel založiť dve — a stránka kalkulácie
-- by odvtedy padala na PGRST116 (multiple rows returned).
--
-- Overené pred nasadením: duplicity v produkcii = 0, index sa založí bez
-- čistenia. Tabuľka má rádovo desiatky riadkov, takže obyčajný CREATE INDEX
-- je okamžitý a CONCURRENTLY netreba (to sa navyše nedá spustiť v transakcii,
-- v akej migrácie bežia).

CREATE UNIQUE INDEX IF NOT EXISTS reservations_quote_group_id_key
  ON public.reservations (quote_group_id)
  WHERE quote_group_id IS NOT NULL;
