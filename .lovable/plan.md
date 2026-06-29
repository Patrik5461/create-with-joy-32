## Modul Kalkulácie (cenové ponuky)

Nový modul pre tvorbu cenových ponúk klientom s prepojením na existujúce rezervácie, nábytok a klientov.

### 1. Databáza (Supabase migrácia)

**Rozšírenie `furniture_items`:**
- `price_per_day` numeric(10,2) nullable
- `price_fixed` numeric(10,2) nullable

**Nové tabuľky:**

`quotes`:
- `quote_number` text unique (auto, formát `Q2026-0001`)
- `client_id` uuid → clients
- `reservation_id` uuid nullable → reservations
- `status` enum: `draft | sent | approved | rejected`
- `issue_date` date, `valid_until` date
- `vat_rate` numeric(5,2) default 23
- `discount_type` enum: `none | percent | fixed`, `discount_value` numeric
- `surcharge_type` enum: `none | percent | fixed`, `surcharge_value` numeric, `surcharge_label` text
- `notes` text
- `subtotal`, `total_without_vat`, `vat_amount`, `total_with_vat` (generované resp. počítané)
- `created_by`, `created_at`, `updated_at`

`quote_items` (nábytok aj služby v jednej tabuľke s `kind`):
- `quote_id` uuid → quotes (cascade)
- `kind` enum: `furniture | service`
- `furniture_item_id` uuid nullable → furniture_items
- `name` text (snapshot názvu / názov služby)
- `qty` numeric
- `price_mode` enum: `per_day | fixed | service`
- `unit_price` numeric (snapshot)
- `days` integer (1 pre fixed/service)
- `line_total` numeric
- `sort_order` int

**RLS a GRANT:** authenticated full CRUD, service_role ALL. Žiadny anon.

**Sequence** pre quote_number + trigger na auto-naplnenie.

### 2. Frontend moduly

**Sklad** (`warehouse.tsx` + edit form):
- Pridať polia "Cena/deň (€)" a "Fixná cena (€)" do formulára nábytku.
- Zobraziť ceny na karte (malým písmom).

**Nový route `/_authenticated/quotes`** s:
- `quotes.index.tsx` — tabuľka kalkulácií, filtre (klient, stav, dátum), tlačidlo Nová.
- `quotes.new.tsx` — formulár.
- `quotes.$id.tsx` — detail + edit + akcie (Duplikovať, Zmazať, Export PDF, Odoslať email).

**Formulár kalkulácie (`QuoteForm`):**
- Výber klienta (kombo + inline "Nový klient" link).
- Výber rezervácie (voliteľné) — pri zmene predvyplní položky a dátumy.
- Sekcia "Položky nábytku": multi-add row, dropdown výberu nábytku, qty, price_mode toggle (per_day/fixed), dni, jednotková cena (predvyplnená, editovateľná), line_total.
- Sekcia "Služby": voľné riadky (názov, suma).
- Zľava (percent/fixed) + Príplatok (percent/fixed, label).
- Sadzba DPH (default 23).
- Live výpočty: medzisúčet, po zľavách/príplatkoch, DPH, celkom s DPH.
- Stav (draft/sent/approved/rejected).
- Poznámka, dátum vystavenia, platnosť do.

### 3. Export PDF (client-side)

- Použiť `window.print()` s dedikovaným print-only layoutom (`<div class="print:block hidden">`) — žiadne SSR knižnice.
- Hlavička: logo MimaProduction, údaje firmy, číslo kalkulácie, dátumy.
- Údaje klienta (IČO, adresa).
- Tabuľka položiek (názov, qty, cena, dni, total).
- Súčty: medzisúčet, zľava/príplatok, bez DPH, DPH (sadzba), spolu.
- Tlačidlo "Tlačiť / Uložiť ako PDF" otvorí print dialóg.

### 4. Odoslanie emailom

- TanStack server function `sendQuoteEmail` (`requireSupabaseAuth`) → využije Resend cez gateway (ak je pripojený) alebo zobrazí info že treba pripojiť email connector.
- V prvej iterácii: email obsahuje link na zdieľanú stránku kalkulácie (public route `/api/public/quotes/$token` na neskôr) — zatiaľ použijeme jednoduchý prístup: server fn vygeneruje email s textovým zhrnutím a HTML rozpisom, bez priloženého PDF. PDF si klient vytlačí cez tlačidlo "Tlačiť" na zdieľanom linku.
- Pre prvý release: pridať len akciu "Označiť ako Odoslaná" + `mailto:` link s predvyplneným textom (rýchle a bez nutnosti connector setupu). Skutočné odosielanie cez Resend pridáme ak používateľ pripojí connector.

### 5. Dashboard widget

- Karta "Kalkulácie" v `dashboard.tsx` so štatistikou: počet návrhov / odoslaných / schválených (posledných 30 dní), link na zoznam.

### 6. Navigácia

- Pridať položku "Kalkulácie" (ikona `FileText` alebo `Calculator`) do `app-sidebar.tsx`.

### Technické poznámky

- Všetky výpočty robiť na frontende v live formulári, ale ukladať aj výsledné totaly do `quotes` pre rýchle zoznamy/filtre.
- Validácia zod schémou v `QuoteForm`.
- Pri prepojení s rezerváciou kopírujeme položky ako snapshot (názov + cena), aby zmeny cien v sklade nemenili odoslané kalkulácie.

Pokračujem implementáciou po schválení plánu.