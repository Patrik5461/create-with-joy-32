-- Uložená suma zľavy.
--
-- Zľava sa doteraz nikde neukladala — v detaile, v tlači aj v PDF sa dopočítavala
-- z `discount_type`/`discount_value` a zo súčtu položiek typu nábytok. Keď sa
-- zmení pravidlo (zľava sa už nevzťahuje na nábytok mimo skladu), staré ponuky
-- by sa začali zobrazovať inak, než ako boli vystavené a poslané klientovi.
--
-- Preto sa suma zľavy odteraz ukladá spolu s ostatnými súčtami. Staré riadky
-- majú NULL a dopočítavajú sa po starom, nové sa zobrazia presne tak, ako boli
-- uložené.
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS discount_amount numeric;

COMMENT ON COLUMN public.quotes.discount_amount IS
  'Suma zľavy v čase uloženia. NULL = staršia kalkulácia, dopočítava sa podľa pôvodného pravidla (zľava zo všetkého nábytku vrátane položiek mimo skladu).';
