-- VOLITEĽNÉ — dátová náprava, nie schéma. Spusti až po zvážení.
--
-- Miesto konania sa z kalkulácie do rezervácie nikdy neprenášalo, takže
-- v kalendári aj v ICS feede je LOCATION prázdne pri všetkých rezerváciách
-- vytvorených z kalkulácie. Kód je od tejto dávky opravený, ale existujúce
-- záznamy sa samy nedoplnia.
--
-- Alternatívou je prekliknúť v CRM „Zosúladiť" na každej kalkulácii — TO ZATIAĽ
-- NEROB HROMADNE: sync popri termínoch prestavia aj reservation_items tak, že
-- ich najprv všetky zmaže a potom vkladá po jednom, mimo transakcie. Ak niektorý
-- insert zamietne kontrola skladu, rezervácia ostane s menej položkami, než mala.
-- Táto migrácia sa položiek nedotýka vôbec — dopĺňa iba miesto a adresu.

-- Náhľad pred spustením (nič nemení):
--   SELECT r.id, r.event_name, r.venue AS rez_miesto, q.venue AS kalk_miesto,
--          r.address AS rez_adresa, q.address AS kalk_adresa
--   FROM public.reservations r
--   JOIN public.quotes q
--     ON q.quote_group_id = r.quote_group_id AND q.is_current AND q.deleted_at IS NULL
--   WHERE r.quote_group_id IS NOT NULL;

UPDATE public.reservations r
   SET venue      = COALESCE(NULLIF(btrim(r.venue), ''),   NULLIF(btrim(q.venue), '')),
       address    = COALESCE(NULLIF(btrim(r.address), ''), NULLIF(btrim(q.address), '')),
       updated_at = now()
  FROM public.quotes q
 WHERE q.quote_group_id = r.quote_group_id
   AND q.is_current
   AND q.deleted_at IS NULL
   AND r.quote_group_id IS NOT NULL
   -- iba tam, kde rezervácia údaj nemá a kalkulácia ho má: ručné úpravy
   -- v rezervácii zostávajú nedotknuté
   AND (
        (NULLIF(btrim(r.venue), '')   IS NULL AND NULLIF(btrim(q.venue), '')   IS NOT NULL)
     OR (NULLIF(btrim(r.address), '') IS NULL AND NULLIF(btrim(q.address), '') IS NOT NULL)
   );
