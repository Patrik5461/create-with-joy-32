import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/hooks/warehouse-backup')({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

        const { data: items, error } = await supabaseAdmin
          .from('furniture_items')
          .select('internal_code,name,total_qty,damaged_qty,retired_qty,price_per_day,photo_url,category_id,furniture_categories(name,code)')
          .order('internal_code', { ascending: true })

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 })
        }

        const headers = [
          'internal_code','name','category_code','category_name',
          'total_qty','damaged_qty','retired_qty','available_qty','price_per_day','photo_url',
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
            it.photo_url ?? '',
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

        // Mirror photos into warehouse-backups under photos/<original-path>.
        // Only copy files that aren't already mirrored — this preserves every
        // photo ever referenced (even if the original gets deleted) without
        // ballooning storage with daily duplicates.
        let photosCopied = 0
        let photosSkipped = 0
        let photosFailed = 0
        const photoPaths = Array.from(
          new Set(
            (items ?? [])
              .map((i: any) => i.photo_url)
              .filter((p: any): p is string => typeof p === 'string' && p.length > 0 && !p.startsWith('http')),
          ),
        )

        for (const srcPath of photoPaths) {
          const destPath = `photos/${srcPath}`
          try {
            // Check if already mirrored
            const lastSlash = destPath.lastIndexOf('/')
            const dir = destPath.slice(0, lastSlash)
            const file = destPath.slice(lastSlash + 1)
            const { data: existing } = await supabaseAdmin.storage
              .from('warehouse-backups')
              .list(dir, { limit: 1, search: file })
            if (existing && existing.some((f) => f.name === file)) {
              photosSkipped++
              continue
            }

            const { data: blob, error: dlErr } = await supabaseAdmin.storage
              .from('furniture-photos')
              .download(srcPath)
            if (dlErr || !blob) {
              photosFailed++
              continue
            }
            const { error: upPhotoErr } = await supabaseAdmin.storage
              .from('warehouse-backups')
              .upload(destPath, blob, {
                contentType: blob.type || 'image/jpeg',
                upsert: false,
              })
            if (upPhotoErr) {
              photosFailed++
              continue
            }
            photosCopied++
          } catch {
            photosFailed++
          }
        }

        return Response.json({
          ok: true,
          path,
          items: rows.length,
          photos: { total: photoPaths.length, copied: photosCopied, skipped: photosSkipped, failed: photosFailed },
        })
      },
    },
  },
})