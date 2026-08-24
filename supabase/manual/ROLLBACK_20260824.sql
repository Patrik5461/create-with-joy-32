-- ============================================================================
-- ROLLBACK migrácií z 24. 8. 2026
-- ============================================================================
-- Vráti databázu presne do stavu pred spustením:
--   20260824120000_revoke_helper_rpc_from_anon.sql
--   20260824120100_protect_ics_token.sql
--   20260824120200_reservations_quote_group_unique.sql
--   manual/20260824_backfill_reservation_venue.sql   (ak si ho spustil)
--
-- Stav pred migráciou bol odčítaný z produkcie 24. 8. 2026 a je zapísaný nižšie
-- doslovne, nie po pamäti.
--
-- POZOR: rollback prvej migrácie znovu otvorí helper RPC anonymnému volaniu.
-- Rob ho len ak sa niečo naozaj pokazilo, a čo najkratšie.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helper RPC — pôvodný stav: anon aj authenticated mali EXECUTE
--    (pg_proc.proacl: postgres=X, anon=X, authenticated=X, service_role=X)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.helper_punch(uuid, text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_helper_pin(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_helper_pin(uuid, text)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.helper_status(uuid)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, public.app_permission) TO anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. profiles — pôvodný stav: plné tabuľkové práva, žiadne stĺpcové granty
--    (pg_class.relacl: anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm)
-- ─────────────────────────────────────────────────────────────────────────────
-- Najprv zmaž stĺpcové granty, ktoré migrácia zaviedla…
REVOKE SELECT (
  id, email, full_name, active, created_at, updated_at,
  username, work_email, phone, job_title
) ON public.profiles FROM authenticated;
REVOKE UPDATE (full_name, work_email, phone, job_title) ON public.profiles FROM authenticated;

-- …a vráť tabuľkové. Ostatné práva (INSERT/DELETE/TRUNCATE/REFERENCES/TRIGGER)
-- migrácia nikdy neodobrala, takže sa neobnovujú.
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_ics_token();

-- Pozor: po tomto rollbacku musí ísť späť aj kód — settings.calendar.tsx
-- v novej verzii volá get_my_ics_token() a bez nej prestane fungovať.


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Unique index na reservations.quote_group_id
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.reservations_quote_group_id_key;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill miesta konania — IBA ak si spustil manual/20260824_backfill…
--
--    Stav k 24. 8. 2026: všetkých 18 rezervácií naviazaných na kalkuláciu malo
--    venue aj address prázdne. Nasledujúce príkazy ich vrátia do toho stavu.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.reservations SET venue = NULL, address = NULL WHERE id IN (
  '00bbceb2-78f9-4eb2-9f07-8dc57213e3ad',
  '049f49e8-38b1-475d-9233-09719adbf49d',
  '0b613f31-13c0-4a0e-8388-dcb7060c082a',
  '12e6ef57-0abd-4de9-8b7c-491f545f8dc0',
  '253abad9-078d-41b1-a253-3738a3658999',
  '3adf37c8-ec09-42b7-ae37-d2f4f1e44e0c',
  '418dafa7-0521-4440-b625-8635a0a7100b',
  '5f26b12d-da37-45ee-86d3-0fa8c4b5ab8a',
  '69f4d879-c774-46c7-83a7-b9b991affe95',
  '6fb1c407-c8c2-4c17-b552-12c0f0302f12',
  '7cdf1c88-94bc-4dcf-b464-fe6adb524dc8',
  '807d4d0b-1899-4ef9-8531-1351fb4c5f80',
  '868721cb-8db8-4f84-a9e5-758937e2c187',
  '8731ddd5-7aeb-4a83-8220-7c57b030b955',
  '8a1fa172-1fba-446d-a4ba-522ee9564e30',
  'aaffad9b-d9e7-4da3-9c44-23bee0c79306',
  'abf83278-ab2e-4ebe-bc15-f87cacfb2ecf',
  'c7bde44c-d5e9-49e8-b698-f02dd1108a0a'
);


-- ─────────────────────────────────────────────────────────────────────────────
-- Kontrola po rollbacku — má vrátiť anon=X pri všetkých piatich funkciách
-- a pri profiles žiadne stĺpcové granty.
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT p.proname, array_to_string(p.proacl, ', ')
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('helper_punch','verify_helper_pin','hash_helper_pin',
--                      'helper_status','has_permission');
