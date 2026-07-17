-- Convert installation_date and dismantling_date to timestamps with time zone so we can capture the exact time.
-- Existing DATE values are interpreted as Bratislava-local 08:00 for installation and 22:00 for dismantling.
ALTER TABLE public.quotes
  ALTER COLUMN installation_date TYPE timestamptz
  USING CASE WHEN installation_date IS NULL THEN NULL
             ELSE (installation_date::text || ' 08:00:00 Europe/Bratislava')::timestamptz END;

ALTER TABLE public.quotes
  ALTER COLUMN dismantling_date TYPE timestamptz
  USING CASE WHEN dismantling_date IS NULL THEN NULL
             ELSE (dismantling_date::text || ' 22:00:00 Europe/Bratislava')::timestamptz END;