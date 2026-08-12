with q as (
  select distinct on (r.id) r.id as reservation_id, qq.id as quote_id
  from public.reservations r
  join public.quotes qq on ((qq.quote_group_id = r.quote_group_id and qq.is_current and qq.deleted_at is null) or qq.reservation_id = r.id)
  where qq.deleted_at is null
  order by r.id, qq.is_current desc, qq.version_number desc
), src as (
  select q.reservation_id,
         string_agg('• ' || qi.name || ' — ' || round(qi.qty)::int || ' ks (nie je v sklade)', E'\n' order by qi.sort_order) as block
  from q
  join public.quote_items qi on qi.quote_id = q.quote_id
  where qi.kind = 'furniture' and qi.furniture_item_id is null and qi.qty > 0
  group by q.reservation_id
)
update public.reservations r
set note = nullif(
    case
      when coalesce(btrim(split_part(coalesce(r.note,''), '── Položky mimo skladu ──', 1)), '') = ''
        then coalesce('── Položky mimo skladu ──' || E'\n' || src.block, '')
      else btrim(split_part(r.note, '── Položky mimo skladu ──', 1))
           || coalesce(E'\n\n' || '── Položky mimo skladu ──' || E'\n' || src.block, '')
    end, ''),
  updated_at = now()
from (
  select r2.id, s.block
  from public.reservations r2
  left join src s on s.reservation_id = r2.id
  where r2.note like '%── Položky mimo skladu ──%' or s.block is not null
) src
where src.id = r.id;