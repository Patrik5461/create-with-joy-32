# MimaProduction CRM – plán implementácie

Interná CRM aplikácia pre správu eventového nábytku, skladu, rezervácií, klientov a logistiky. Postavené na TanStack Start + Supabase (už pripojené).

## 1. Dizajn a layout

- Moderný CRM look: tmavý/svetlý režim, profesionálna typografia (napr. Inter/Space Grotesk pre nadpisy), akcentová farba inšpirovaná eventovou brandžou (hlboká indigo + jantárový accent), nie generický fialový gradient.
- Sidebar layout (collapsable na mobile), hlavička s názvom „MimaProduction CRM“, prepínač témy, info o používateľovi a odhlásenie.
- Tabová stránka má `<title>MimaProduction CRM</title>` cez `head()` v `__root.tsx`.
- Všetky farby ako semantické tokeny v `src/styles.css` (oklch), shadcn komponenty s variantmi.

## 2. Autentifikácia a roly

- Iba prihlasovacia obrazovka `/auth` (verejná) – email + heslo cez Supabase Auth. Žiadna verejná registrácia.
- Chránený layout `src/routes/_authenticated/route.tsx` (managed integráciou) presmeruje neprihlásených na `/auth`.
- Po prihlásení redirect na `/` (dashboard).
- Roly: `admin`, `manager`, `warehouse` – cez samostatnú tabuľku `user_roles` + enum `app_role` + `SECURITY DEFINER` funkcia `has_role(uuid, app_role)`.
- Iba admin môže vytvárať nových používateľov (modul „Používatelia“ – zoznam + formulár, ktorý cez chránenú server function s `requireSupabaseAuth` + `has_role(..., 'admin')` zavolá Supabase Auth Admin API a priradí rolu).
- Prvý admin sa nastaví manuálne v Supabase dashboarde (po prvom signup-e). Toto v UI vysvetlím.

## 3. Databáza (Supabase, RLS všade)

Tabuľky v `public` schéme so `GRANT` + RLS:

- `app_role` enum: `admin`, `manager`, `warehouse`.
- `profiles` (id = auth.users.id, full_name, email, active).
- `user_roles` (user_id, role) – unikátny pár.
- `clients` – názov firmy, IČO, kontaktná osoba, telefón, email, adresa, poznámky.
- `furniture_categories` – seed: stoly, stoličky, lounge, bary, dekorácie, osvetlenie, doplnky, ostatné.
- `furniture_items` – názov, category_id, photo_url, internal_code (unique), dimensions, color, note, total_qty, damaged_qty, retired_qty, active. Dostupné = total - damaged - retired (computed v UI/SQL view).
- `reservation_statuses` enum: `inquiry`, `confirmed`, `prepared`, `loaded`, `delivered`, `in_progress`, `returned`, `cancelled`.
- `reservations` – client_id, contact_person, phone, email, event_name, venue, address, note, status, časy: `load_at`, `depart_at`, `event_start_at`, `event_end_at`, `return_at`, `available_from_at`, created_by.
- `reservation_items` – reservation_id, furniture_item_id, qty.
- `logistics` – reservation_id, load_time, unload_time, return_time, internal_note, assigned_to.
- `damaged_items` – furniture_item_id, qty, reason, reported_at, reported_by, reservation_id (nullable).
- Storage bucket `furniture-photos` (public read pre interný systém s auth listom – v skutočnosti private + signed URLs; pre jednoduchosť public bucket lebo všetko za loginom v UI).

### RLS politiky (zhrnutie)
- `profiles`, `user_roles`: čítanie pre prihlásených, zápis len admin.
- `clients`, `reservations`, `reservation_items`, `logistics`: SELECT pre všetky roly; INSERT/UPDATE pre admin a manager; DELETE len admin.
- `furniture_*`, `damaged_items`: SELECT pre všetkých; INSERT/UPDATE pre admin a warehouse; DELETE len admin.

### Inteligentná dostupnosť (kľúčová funkcia)

SQL funkcia `check_availability(item_id uuid, qty int, from_ts timestamptz, to_ts timestamptz, exclude_reservation uuid default null) returns table(available int, reserved int, total int)`:

- Berie všetky `reservation_items` daného `furniture_item_id`, kde rezervácia nie je `cancelled` a jej interval `[load_at, available_from_at)` sa prekrýva s `[from_ts, to_ts)`.
- Sumuje `qty` prekrývajúcich sa rezervácií = `reserved`.
- `available = total_qty - damaged_qty - retired_qty - reserved`.

Trigger `validate_reservation_availability` BEFORE INSERT/UPDATE na `reservation_items` (a pri zmene časov na `reservations`) zamietne uloženie, ak ktorákoľvek položka nemá dosť kusov – aplikácia zobrazí: „Nie je dostupný dostatočný počet kusov v zvolenom čase.“

Časový interval rezervácie pre účely dostupnosti = `[load_at, available_from_at)`, takže ak sa nábytok vráti o 14:00 a `available_from_at` je 15:00, ďalšia rezervácia od 15:00 prejde.

## 4. Server logika

TanStack `createServerFn` (nie edge functions):

- `src/lib/users.functions.ts` – `listUsers`, `createUser` (admin-only, Supabase Auth Admin API + insert role), `updateUserRole`, `deactivateUser`.
- `src/lib/clients.functions.ts` – CRUD + história rezervácií.
- `src/lib/furniture.functions.ts` – CRUD, upload fotky (signed upload URL).
- `src/lib/reservations.functions.ts` – CRUD, `checkAvailability(items, from, to)`, zmena stavu.
- `src/lib/logistics.functions.ts` – denný plán, CRUD.
- `src/lib/dashboard.functions.ts` – agregácie: dnešné nakládky/návraty, mimo skladu, najbližšie eventy, konflikty, štatistiky mesiaca, top prenajímaný nábytok, vyťaženosť.

Všetko cez `requireSupabaseAuth`; admin-only funkcie navyše overia `has_role`.

## 5. Routes (TanStack file-based)

```text
src/routes/
  __root.tsx                       (title, theme, providers)
  index.tsx                        (redirect na /auth alebo /dashboard)
  auth.tsx                         (prihlásenie)
  _authenticated/
    route.tsx                      (managed gate)
    dashboard.tsx
    warehouse.index.tsx            (zoznam nábytku)
    warehouse.$id.tsx              (detail/editácia)
    reservations.index.tsx         (kalendár deň/týždeň/mesiac)
    reservations.new.tsx
    reservations.$id.tsx
    clients.index.tsx
    clients.$id.tsx
    logistics.tsx
    users.tsx                      (admin only)
```

## 6. Moduly – UI

- **Dashboard**: karty s dnešnými nakládkami, návratmi, nábytok mimo skladu, najbližšie eventy (7 dní), upozornenia na konflikty, štatistické karty (mesiac, aktívne rezervácie, top nábytok, vyťaženosť skladu %).
- **Sklad**: tabuľka + grid s fotkami, filter podľa kategórie/farby/dostupnosti, vyhľadávanie, modálne formuláre na pridanie/editáciu, action „deaktivovať“. Detail ukáže históriu rezervácií a poškodení.
- **Kalendár rezervácií**: prepínač Deň/Týždeň/Mesiac (knižnica `react-big-calendar` alebo vlastný komponent – použijem ľahké vlastné riešenie s `date-fns` aby som sa vyhol ťažkým závislostiam). Klik na slot otvorí nový formulár.
- **Formulár rezervácie**: klient (select + quick create), kontakt, event detaily, časové polia (datetime-local), tabuľka pridaných položiek s live výpisom „Celkom / Rezervované / Voľné“ podľa `check_availability`. Tlačidlo Uložiť volá server fn; ak trigger vyhodí chybu, ukáže slovenskú hlášku.
- **Stavy rezervácie**: badge + dropdown na zmenu stavu (s respektovaním rolí).
- **Klienti**: tabuľka, detail so záložkami Info / Rezervácie.
- **Logistika**: denný plán (zoznam podľa dátumu) – nakládky a návraty zoradené v čase, editovateľné poznámky.
- **Používatelia (admin)**: zoznam + formulár (email, meno, heslo, rola).

## 7. Implementačné poradie

1. Migrácia DB (enums, tabuľky, GRANT, RLS, `has_role`, `check_availability`, trigger, seed kategórií, storage bucket).
2. Dizajn systém v `src/styles.css` + základný layout (sidebar, header, theme toggle).
3. Auth flow + chránený layout + redirect z `/`.
4. Modul Sklad.
5. Modul Klienti.
6. Modul Rezervácie + kalendár + dostupnosť.
7. Modul Logistika.
8. Dashboard agregácie.
9. Admin – Používatelia.
10. Sitemap/robots (minimal – interná appka, `robots.txt` zakáže crawl).

## Technické poznámky (pre vývoj)

- TanStack Start + TanStack Query, server fns s `requireSupabaseAuth`.
- `attachSupabaseAuth` v `src/start.ts`.
- Žiadne edge functions – všetko `createServerFn`.
- Pre admin operácie nad Auth API načítam `supabaseAdmin` cez `await import("@/integrations/supabase/client.server")` vnútri handlera.
- Trigger na dostupnosť beží v DB → istota, že žiaden klient ho neobíde.
- Časové polia ukladáme ako `timestamptz`.
- Texty v UI po slovensky.

Po schválení začnem migráciou databázy.