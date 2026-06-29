## Modul Chat - interný real-time chat

### Dátový model (migrácia)

**Tabuľky v `public`:**

1. `conversations`
   - `id uuid pk`
   - `type text` ('global' | 'direct')
   - `created_at timestamptz`
   - unique partial index: jedna 'global' konverzácia; pre 'direct' deterministický kľúč cez pomocné pole

2. `conversation_participants`
   - `conversation_id uuid fk → conversations`
   - `user_id uuid fk → profiles`
   - `last_read_at timestamptz default now()`
   - PK (conversation_id, user_id)

3. `messages`
   - `id uuid pk`
   - `conversation_id uuid fk`
   - `sender_id uuid fk → profiles`
   - `body text`
   - `attachment_url text`, `attachment_name text`, `attachment_mime text`
   - `created_at timestamptz`

4. `message_mentions`
   - `message_id uuid fk → messages on delete cascade`
   - `user_id uuid fk → profiles`
   - PK (message_id, user_id)

**Security definer fn `public.is_conversation_participant(_conv uuid, _user uuid)`** — kvôli RLS bez rekurzie. Pre 'global' konverzáciu vracia true pre každého prihláseného (každý profil je účastník).

**RLS politiky:**
- `conversations`: SELECT pre účastníkov (cez fn) + pre type='global'. INSERT pre authenticated. UPDATE/DELETE iba service_role.
- `conversation_participants`: SELECT ak je user účastník danej konverzácie. INSERT/DELETE: user môže pridať seba; alebo do priamej konverzácie môže pridať druhú stranu pri vytvorení.
- `messages`: SELECT ak je účastník. INSERT ak `sender_id = auth.uid()` AND je účastník. UPDATE/DELETE iba vlastné.
- `message_mentions`: SELECT ak je účastník konverzácie správy. INSERT odosielateľom správy.

**Pomocné RPC:**
- `get_or_create_direct_conversation(_other uuid) returns uuid` — security definer; nájde existujúcu 'direct' konverzáciu s presne dvoma účastníkmi {auth.uid(), _other} alebo vytvorí.
- `ensure_global_conversation()` — vloží jeden riadok pri inicializácii (seed v migrácii) + trigger na `profiles` AFTER INSERT pridá nového profilu medzi účastníkov globálnej konverzácie.
- Migrácia tiež pridá všetkých existujúcich profilov ako účastníkov globálnej konverzácie.

**Realtime publication:**
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.messages, public.message_mentions, public.conversation_participants;`
- `ALTER TABLE ... REPLICA IDENTITY FULL` na týchto tabuľkách.

**GRANTy** pre `authenticated` (SELECT/INSERT/UPDATE/DELETE podľa potreby) a `service_role ALL` na všetkých nových tabuľkách.

### Storage

Nový bucket `chat-attachments` (privátny) cez `supabase--storage_create_bucket`. RLS politiky na `storage.objects`:
- INSERT/SELECT authenticated v rámci `chat-attachments` (cestou `{conversation_id}/{filename}`); SELECT povolíme len účastníkom konverzácie cez join na `conversation_participants` (resp. zjednodušene: každý authenticated, keďže URL nikde nezdieľame). Praktický kompromis: SELECT pre authenticated, keďže URL sa vždy generuje signed.
- Použijeme **signed URLs** (1h) pri zobrazení príloh.

### Frontend

**Nová route `src/routes/_authenticated/chat.tsx`** (`ssr: false` aby sa SSR nepokúšalo o realtime/localStorage):
- Layout: ľavý panel (sidebar konverzácií) + pravý panel (správy + input).
- Responzívne: na mobile prepínanie medzi zoznamom a aktívnym chatom (`useIsMobile`).

**Komponenty (`src/components/chat/`):**
- `conversation-list.tsx` — Všetci (global) + zoznam direct konverzácií + tlačidlo "Nová správa" → dialog so zoznamom používateľov.
- `message-list.tsx` — virtualizácia nie nutná, scroll na koniec; bubliny: vlastné vpravo (primary), cudzie vľavo; meno + čas; render `@mentions` ako badge; obrázky inline (`<img>` so signed URL), iné súbory ako odkaz s ikonou.
- `message-composer.tsx` — textarea s autosize, attach button (upload do Storage), `@` mention popover s filtered zoznamom profiles, Enter na odoslanie, Shift+Enter newline.
- `unread-badge.tsx` — používa hook.

**Hooky (`src/hooks/`):**
- `use-chat-conversations.ts` — query na konverzácie kde som účastník + last message + unread count (na základe `last_read_at` vs `messages.created_at`).
- `use-chat-messages.ts` — query messages danej konv. + realtime subscription (INSERT/DELETE) v `useEffect` s cleanup cez `removeChannel`. Mark-as-read: pri otvorení/novej správe update `last_read_at` na `now()` pre (conv, me).
- `use-unread-total.ts` — globálne počítadlo cez query (sum unreadov), invalidate pri realtime INSERT.
- `use-online-profiles.ts` (voliteľné, vynechané pre jednoduchosť).

**Sidebar:** v `src/components/app-sidebar.tsx` pridať položku "Chat" s `MessageSquare` ikonou a badge s počtom neprečítaných (z `use-unread-total`). Pri @mention navyše toast (sonner) keď príde realtime mention pre mňa — riešené v root listener-i alebo v `use-unread-total`.

**Globálny notifikátor:** v `_authenticated/route.tsx` (alebo nový tichý komponent v rámci sidebaru) namountujeme `useChatNotifications()` ktorý subscribuje na všetky moje konverzácie cez jeden kanál `messages:user:{me}` a:
- invaliduje queries
- ak mention obsahuje moje id → `toast("Spomenuli ťa: ...")`
- ak správa nie je v aktívnej konv → `toast` s názvom odosielateľa

### Server functions

Žiadne — všetko cez priamy `supabase` klient s RLS (vrátane uploadu prílohy). RPC `get_or_create_direct_conversation` voláme cez `supabase.rpc()`.

### Riziká / SSR

- Route `chat.tsx` má `ssr: false`.
- Realtime subscription výhradne v `useEffect`, cleanup `removeChannel` — zabraňuje účtovacej slučke.
- Upload prílohy: `supabase.storage.from('chat-attachments').upload(...)`.
- Žiadne node-only knižnice.

### Pri publish/self-host
Funguje proti nášmu Supabase projektu (env je `VITE_SUPABASE_URL` + publishable key), realtime cez ten istý projekt.

### Súbory na vytvorenie/úpravu

- migrácia (tabuľky, RLS, RPC, triggery, realtime publication, seed global)
- `src/routes/_authenticated/chat.tsx`
- `src/components/chat/conversation-list.tsx`
- `src/components/chat/message-list.tsx`
- `src/components/chat/message-composer.tsx`
- `src/components/chat/chat-notifications.tsx`
- `src/hooks/use-chat-conversations.ts`
- `src/hooks/use-chat-messages.ts`
- `src/hooks/use-unread-total.ts`
- úprava `src/components/app-sidebar.tsx` (položka Chat + badge + mount notifications)
- bucket `chat-attachments`
