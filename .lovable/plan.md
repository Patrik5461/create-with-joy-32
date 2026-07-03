# Plán: Rozcestník rolí v natívnej appke + Helper režim

## 1. Detekcia natívnej platformy

- Nový util `src/lib/platform.ts` — `isNativeApp()` cez `(window as any).Capacitor?.isNativePlatform?.() === true`. Bezpečne vráti `false` na webe aj keď Capacitor ešte nie je nainštalovaný.
- Capacitor teraz **neinštalujem** — detekcia je pripravená a začne vracať `true` až keď sa neskôr pridá Capacitor runtime.

## 2. Nový vstupný bod

- `src/routes/index.tsx` už len redirectuje na `/dashboard`. Zmením na:
  - Ak `isNativeApp()` → render rozcestníka (tri veľké tlačidlá: **Helper**, **Prihlásenie**, **Katalóg**).
  - Inak → `redirect({ to: "/auth" })` ak neprihlásený, alebo `/dashboard` ak prihlásený (súčasné správanie web nezmení — web ide rovno na login/dashboard).
- Rozcestník: `ssr: false`, plný-výška mobile layout, tri karty s ikonami (HardHat, LogIn, BookOpen). Odkazy:
  - Helper → `/helper`
  - Prihlásenie → `/auth`
  - Katalóg → `/katalog` (existuje)

## 3. Databáza — helperi + dochádzka

Migrácia:

- `public.helpers` — meno, `pin_hash` (bcrypt/sha256+salt), `is_active`, poznámka.
  - GRANT `SELECT, INSERT, UPDATE, DELETE` len `authenticated` + `ALL` `service_role`. **Anon nemá prístup.**
  - RLS: `has_role(auth.uid(), 'admin')` na všetky operácie. Manager môže `SELECT` (aby videl mená v súhrnoch). Nikto okrem admina nevidí `pin_hash`.
- `public.attendance` — pridám nullable stĺpce:
  - `helper_id uuid references public.helpers(id)`
  - `is_helper boolean default false`
  - Constraint: `user_id IS NOT NULL OR helper_id IS NOT NULL`.
- RPC `public.verify_helper_pin(_name text, _pin text) returns uuid` — security definer, vráti `helper_id` ak sedí, inak NULL. Neexponuje hashe.
- RPC `public.helper_punch(_helper_id uuid, _action text) returns jsonb` — security definer, otvorí/uzavrie dochádzkový záznam pre helpera (pracuje s `attendance` cez service-level práva). Kontroluje `is_active`.
  - Volá sa **len zo server function** s bearer tokenom `x-helper-token` (helper session token, pozri nižšie). RPC samo neverifikuje token — verifikuje ho server fn.

## 4. Helper flow (bez Supabase auth)

Nová route `src/routes/helper.tsx` (`ssr: false`, verejná):

1. Krok 1: dropdown/list mien z verejného server fn `listHelperNames()` — vracia len `{id, name}` aktívnych helperov (žiadny PIN).
2. Krok 2: číselník PIN (4 cifry).
3. Overenie: server fn `verifyHelperPin({helperId, pin})` — v handleri `import supabaseAdmin` (dynamický `.server` import), zavolá `verify_helper_pin`. Ak OK, vráti krátky JWT/HMAC token (podpísaný `HELPER_SESSION_SECRET`, TTL 8h, obsahuje `helper_id`).
4. Klient uloží token do sessionStorage → obrazovka **Štart / Prestávka / Koniec** s aktuálnym stavom (načíta cez `helperStatus({token})`).
5. Pichnutie: `helperPunch({token, action})` → server fn overí token, zavolá `helper_punch` RPC cez `supabaseAdmin`.
6. Po Koniec → wipe token → späť na rozcestník.

Server fns v `src/lib/helper.functions.ts` + `src/lib/helper.server.ts` (HMAC token, admin import). Žiadne Node-only knižnice — HMAC cez WebCrypto.

## 5. Admin UI — správa helperov

- Nová route `src/routes/_authenticated/settings.helpers.tsx` — admin-only tab.
  - Tabuľka: meno, aktívny, vytvorený.
  - Akcie: Pridať helpera (meno + PIN alebo "vygenerovať 4-miestny"), Regenerovať PIN, Deaktivovať/Zmazať.
  - PIN sa zobrazí **len raz po vytvorení/regenerácii** (potom je hash).
- Pridám do sidebar sekcie **Nastavenia** (admin-only, ikona `Users` alebo `HardHat`).

## 6. Zobrazenie helper hodín v súhrnoch

- Miesta, kde sa listuje `attendance`, upravím tak, aby JOIN cez `helper_id → helpers.name` a označilo záznam štítkom "Helper". Filter aj po helperoch.

## 7. Bezpečnosť — zhrnutie

- Helper nikdy nedostane Supabase JWT. Všetka jeho interakcia ide cez podpísaný HMAC token → server fn → admin klient s **úzko obmedzenými** RPC (`helper_punch`, `helperStatus`). Žiadny prístup ku klientom, rezerváciám, cenám.
- `listHelperNames` je jediný verejný endpoint a vracia iba `{id, name}` aktívnych — bez PINov, bez emailov.
- Sekret `HELPER_SESSION_SECRET` v env (pridám cez add_secret).
- Rate-limit na `verifyHelperPin` (in-memory throttle per IP + per helperId; jednoduchý counter v pamäti — best effort na edge).

## 8. Čo sa NEmení

- Web (`crm.mimapro.sk`) — `isNativeApp()` je `false`, `/` presmeruje ako doteraz.
- `/auth`, `/dashboard`, existujúce role gating, Resend integrácia, katalóg — bez zmeny.

## Technické súbory

**Nové:**
- `src/lib/platform.ts`
- `src/lib/helper.functions.ts`, `src/lib/helper.server.ts`
- `src/routes/helper.tsx`
- `src/routes/_authenticated/settings.helpers.tsx`
- migrácia (helpers tabuľka, RPC, GRANTy, attendance stĺpce)

**Zmenené:**
- `src/routes/index.tsx` — rozcestník vs redirect
- `src/components/app-sidebar.tsx` — link na Helperov (admin)
- Miesta so súhrnmi dochádzky — JOIN helpers

## Otvorená otázka

Chceš, aby helper zaznamenal aj **prestávku** (start/end break), alebo len Štart práce / Koniec práce? Píšeš oboje aj "a prípadne prestávka" — potvrď, či implementujem prestávku hneď alebo neskôr.
