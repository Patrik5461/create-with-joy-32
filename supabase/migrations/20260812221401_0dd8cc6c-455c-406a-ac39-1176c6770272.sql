with src as (
  select r.id as reservation_id,
         string_agg('• ' || qi.name || ' — ' || round(qi.qty)::int || ' ks (nie je v sklade)', E'\n' order by qi.sort_order) as block
  from public.reservations r
  join public.quotes q on ((q.quote_group_id = r.quote_group_id and q.is_current and q.deleted_at is null) or q.reservation_id = r.id)
  join public.quote_items qi on qi.quote_id = q.id
  where qi.kind = 'furniture' and qi.furniture_item_id is null and qi.qty > 0
  group by r.id
)
update public.reservations r
set note = case
    when coalesce(btrim(split_part(coalesce(r.note,''), '── Položky mimo skladu ──', 1)), '') = ''
      then '── Položky mimo skladu ──' || E'\n' || src.block
    else btrim(split_part(r.note, '── Položky mimo skladu ──', 1)) || E'\n\n' || '── Položky mimo skladu ──' || E'\n' || src.block
  end,
  updated_at = now()
from src
where src.reservation_id = r.id;