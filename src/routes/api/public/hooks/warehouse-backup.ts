import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/hooks/warehouse-backup')({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

        const { data: items, error } = await supabaseAdmin
          .from('furniture_items')
          .select('internal_code,name,total_qty,damaged_qty,retired_qty,price_per_day,category_id,furniture_categories(name,code)')
          .order('internal_code', { ascending: true })

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 })
        }

        const headers = [
          'internal_code','name','category_code','category_name',
          'total_qty','damaged_qty','retired_qty','available_qty','price_per_day',
        ]
        const escape = (v: unknown) => {
          if (v === null || v === undefined) return ''
          const s = String(v)
          return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        }
        const rows = (items ?? []).map((it: any) => {
          const total = Number(it.total_qty ?? 0)
          const damaged = Number(it.damaged_qty ?? 0)
          const retired = Number(it.retired_qty ?? 0)
          return [
            it.internal_code, it.name,
            it.furniture_categories?.code ?? '',
            it.furniture_categories?.name ?? '',
            total, damaged, retired, total - damaged - retired,
            it.price_per_day ?? '',
          ].map(escape).join(',')
        })
        const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n')

        const now = new Date()
        const yyyy = now.getUTCFullYear()
        const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(now.getUTCDate()).padStart(2, '0')
        const hh = String(now.getUTCHours()).padStart(2, '0')
        const mi = String(now.getUTCMinutes()).padStart(2, '0')
        const path = `${yyyy}/${mm}/sklad-${yyyy}${mm}${dd}-${hh}${mi}.csv`

        const { error: upErr } = await supabaseAdmin.storage
          .from('warehouse-backups')
          .upload(path, new Blob([csv], { type: 'text/csv;charset=utf-8' }), {
            contentType: 'text/csv;charset=utf-8',
            upsert: true,
          })

        if (upErr) {
          return Response.json({ ok: false, error: upErr.message }, { status: 500 })
        }

        return Response.json({ ok: true, path, items: rows.length })
      },
    },
  },
})