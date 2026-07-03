
-- Verziovanie kalkulácií
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS quote_group_id uuid,
  ADD COLUMN IF NOT EXISTS version_number int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS parent_version_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL;

-- Backfill: každá existujúca kalkulácia je vlastný "group" v1, aktuálna
UPDATE public.quotes SET quote_group_id = id WHERE quote_group_id IS NULL;

ALTER TABLE public.quotes ALTER COLUMN quote_group_id SET NOT NULL;
ALTER TABLE public.quotes ALTER COLUMN quote_group_id SET DEFAULT gen_random_uuid();

-- quote_number už nie je globálne unikátny – všetky verzie zdieľajú číslo.
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_quote_number_key;

-- Unikátna verzia v rámci skupiny.
CREATE UNIQUE INDEX IF NOT EXISTS quotes_group_version_uidx
  ON public.quotes (quote_group_id, version_number);

-- Iba jedna aktuálna verzia na skupinu.
CREATE UNIQUE INDEX IF NOT EXISTS quotes_group_current_uidx
  ON public.quotes (quote_group_id) WHERE is_current;

CREATE INDEX IF NOT EXISTS quotes_group_idx ON public.quotes (quote_group_id);
