# Ručné skripty — nespúšťajú sa cez `supabase db push`

Súbory v tomto adresári **nie sú migrácie**. Sú tu práve preto, aby ich
`supabase db push` nespustil spolu s ostatnými. Púšťaj ich vedome, jeden po
druhom, cez SQL Editor v Supabase dashboarde.

| Súbor | Čo robí |
|---|---|
| `20260824_backfill_reservation_venue.sql` | Doplní miesto konania do existujúcich rezervácií. Voliteľné, mení dáta. |
| `ROLLBACK_20260824.sql` | Vráti migrácie z 24. 8. 2026 do pôvodného stavu. |

---

## Záloha pred migráciou

Postupuj v tomto poradí.

### 1. Skontroluj automatické zálohy

Dashboard → **Database → Backups**. Na Pro pláne tam nájdeš denné zálohy
a prípadne Point-in-Time Recovery; na Free pláne **žiadne nie sú** a plný dump
nižšie je jediná poistka. Pozri sa tam skôr, než pustíš čokoľvek ďalšie.

### 2. Vezmi si plný dump

`pg_dump` na tomto stroji nie je nainštalovaný, ale Supabase CLI ho vie
stiahnuť cez `npx` bez inštalácie čohokoľvek natrvalo:

```bash
cd /home/patrik/create-with-joy-32
mkdir -p ~/mima-backups

# Connection string skopíruj DOSLOVNE z dashboardu:
#   Project Settings → Database → Connection string → URI
# (host aj región sa líšia podľa projektu, nevypisuj ich z hlavy)
# Heslo doň doplň priamo v termináli, nikam ho nekopíruj.
export DB_URL='TU_VLOZ_URI_Z_DASHBOARDU'

# schéma (tabuľky, funkcie, politiky, granty)
npx --yes supabase@latest db dump --db-url "$DB_URL" \
  -f ~/mima-backups/mima-$(date +%Y%m%d-%H%M)-schema.sql

# dáta
npx --yes supabase@latest db dump --db-url "$DB_URL" --data-only \
  -f ~/mima-backups/mima-$(date +%Y%m%d-%H%M)-data.sql

unset DB_URL
```

Over, že súbory nie sú prázdne a že schéma obsahuje očakávané objekty:

```bash
ls -lh ~/mima-backups/
grep -c "CREATE POLICY" ~/mima-backups/mima-*-schema.sql   # má byť rádovo 100+
grep -c "COPY public\." ~/mima-backups/mima-*-data.sql     # má byť ~39
```

> Zálohy **nedávaj do repozitára** — obsahujú kontaktné údaje klientov aj
> `ics_token` a `pin_hash`. `~/mima-backups/` je mimo projektu zámerne.

### 3. Až potom migruj

```
supabase/migrations/20260824120000_revoke_helper_rpc_from_anon.sql
supabase/migrations/20260824120100_protect_ics_token.sql   ← spolu s nasadením kódu
supabase/migrations/20260824120200_reservations_quote_group_unique.sql
```

Druhá migrácia a nasadenie CRM musia ísť naraz: odoberá `authenticated` prístup
k stĺpcu `ics_token`, a stránka *Nastavenia → Kalendár* v starej verzii kódu ho
číta priamo. Nová verzia už volá `get_my_ics_token()`.

### 4. Kontrola po migrácii

```sql
-- anon už nesmie vidieť ani jednu z týchto piatich funkcií
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_moze
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('helper_punch','verify_helper_pin','hash_helper_pin',
                     'helper_status','has_permission');

-- profiles má mať stĺpcové granty a ics_token medzi nimi chýbať
select a.attname, array_to_string(a.attacl, ', ')
  from pg_attribute a
 where a.attrelid = 'public.profiles'::regclass and a.attacl is not null
 order by a.attname;
```

Web (mimapro.sk) sa žiadnej z týchto zmien nedotýka — beží pod rolou `anon` nad
`site_settings`, `site_slides`, `galleries`, `gallery_images`, `web_visibility`,
`products_public`, `categories_public` a insertom do `inquiries`. Ani jedna
politika ani pohľad z tejto množiny nevolá funkcie, ktorých sa migrácia týka.
