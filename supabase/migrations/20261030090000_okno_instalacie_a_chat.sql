-- Dve veci, ktoré potrebujú zmenu v databáze.
--
-- 1) OKNO NA INŠTALÁCIU A DEMONTÁŽ
-- Klient často nepovie hodinu, ale rozsah: „stavať sa dá 7:00 – 12:00".
-- Doteraz sa do kalkulácie zmestil len jeden čas, takže sa tá podstatná časť
-- dohody stratila a chalani na mieste nevedeli, dokedy majú okno.
-- Pôvodné `installation_date` / `dismantling_date` ostávajú začiatkom okna,
-- nové stĺpce sú jeho koncom. Prázdny koniec = jeden čas, ako doteraz.

alter table public.quotes
  add column if not exists installation_end_at timestamptz,
  add column if not exists dismantling_end_at timestamptz;

alter table public.reservations
  add column if not exists installation_end_at timestamptz,
  add column if not exists dismantling_end_at timestamptz;

comment on column public.quotes.installation_end_at is 'Koniec okna na instalaciu; NULL = len jeden cas (installation_date).';
comment on column public.quotes.dismantling_end_at is 'Koniec okna na demontaz; NULL = len jeden cas (dismantling_date).';
comment on column public.reservations.installation_end_at is 'Koniec okna na instalaciu, prenesene z kalkulacie.';
comment on column public.reservations.dismantling_end_at is 'Koniec okna na demontaz, prenesene z kalkulacie.';

-- 2) CHAT: FIREMNÝ KANÁL NEVIDÍ KAŽDÝ
-- Doteraz platilo, že konverzáciu typu `global` smel čítať každý prihlásený —
-- stačilo mať prístup do chatu. Kto teda dostal chat, čítal aj všetko, čo sa
-- ho netýka. Odteraz firemný kanál vidí vedenie (admin, manažér) a každý, kto
-- je v ňom vedený ako účastník; ostatní majú len svoje vlastné konverzácie.
-- Priame správy sa nemenia vôbec — tie vždy videli len tí dvaja.

create or replace function public.is_conversation_participant(_conv uuid, _user uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conv AND user_id = _user
  ) OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conv
      AND c.type = 'global'
      AND (
        public.has_role(_user, 'admin'::app_role)
        OR public.has_role(_user, 'manager'::app_role)
      )
  );
$$;

-- Rovnaké pravidlo musí platiť aj pre samotný zoznam konverzácií, inak by sa
-- firemný kanál v zozname objavil (a otvoril prázdny).
drop policy if exists "select own or global conv" on public.conversations;
create policy "select own or global conv"
  on public.conversations for select to authenticated
  using (public.is_conversation_participant(id, auth.uid()));
