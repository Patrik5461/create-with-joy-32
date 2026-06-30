import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Printer, Search } from "lucide-react";
import { QRCode, buildFurnitureScanUrl } from "@/components/qr-code";
import QR from "qrcode";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/warehouse/qr-print")({
  head: () => ({ meta: [{ title: "Tlač QR štítkov · Mima Production CRM" }] }),
  component: QrPrint,
});

type Row = {
  id: string;
  name: string;
  internal_code: string;
  total_qty: number;
  furniture_categories: { name: string } | null;
};

type PrintLabel = Row & { dataUrl: string; copyIndex: number; copyTotal: number };

function QrPrint() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [printLabels, setPrintLabels] = useState<PrintLabel[]>([]);

  const items = useQuery({
    queryKey: ["furniture_qr_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("furniture_items")
        .select("id, name, internal_code, total_qty, furniture_categories(name)")
        .eq("active", true)
        .order("internal_code");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items.data ?? []).filter(
      (i) => !q || i.name.toLowerCase().includes(q) || i.internal_code.toLowerCase().includes(q),
    );
  }, [items.data, search]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = () => setSelected(new Set(filtered.map((i) => i.id)));
  const clearAll = () => setSelected(new Set());

  const toPrint = filtered.filter((i) => selected.has(i.id));
  const getQty = (i: Row) => {
    const c = counts[i.id];
    if (c === undefined) return Math.max(1, Number(i.total_qty) || 1);
    return Math.max(1, c);
  };
  const totalLabels = toPrint.reduce((s, i) => s + getQty(i), 0);

  const handlePrint = async () => {
    if (toPrint.length === 0) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    try {
      const perItem = await Promise.all(
        toPrint.map(async (i) => {
          const dataUrl = await QR.toDataURL(buildFurnitureScanUrl(i.id), {
            width: 300,
            margin: 1,
            errorCorrectionLevel: "M",
          });
          return { item: i, dataUrl, qty: getQty(i) };
        }),
      );
      const labels: PrintLabel[] = [];
      for (const { item, dataUrl, qty } of perItem) {
        for (let k = 0; k < qty; k++) {
          labels.push({ ...item, dataUrl, copyIndex: k + 1, copyTotal: qty });
        }
      }
      setPrintLabels(labels);
      if (printWindow) {
        writePrintDocument(printWindow, labels);
        return;
      }
      requestAnimationFrame(() => setTimeout(() => window.print(), 150));
    } catch (e: any) {
      printWindow?.close();
      toast.error(e?.message ?? "Nepodarilo sa pripraviť tlač");
    }
  };

  return (
    <>
      <div className="print:hidden">
        <AppHeader title="Tlač QR štítkov" />
      </div>
      <div className="p-4 md:p-6 space-y-4 print:hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/warehouse"><ArrowLeft className="size-4 mr-1" />Sklad</Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>Označiť všetky</Button>
            <Button variant="outline" size="sm" onClick={clearAll} disabled={selected.size === 0}>Zrušiť výber</Button>
            <Button size="sm" onClick={handlePrint} disabled={toPrint.length === 0}>
              <Printer className="size-4 mr-1" /> Tlačiť ({totalLabels} ks)
            </Button>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Hľadať podľa názvu alebo kódu…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Card>
          <CardContent className="p-0 max-h-[60vh] overflow-y-auto divide-y">
            {filtered.map((i) => (
              <div key={i.id} className="flex items-center gap-3 p-3 hover:bg-muted/50">
                <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                  <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggle(i.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{i.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {i.internal_code} · skladom {i.total_qty} ks
                    </div>
                  </div>
                  <Badge variant="outline">{i.furniture_categories?.name ?? "—"}</Badge>
                </label>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">Štítkov:</span>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 w-20"
                    value={getQty(i)}
                    disabled={!selected.has(i.id)}
                    onChange={(e) =>
                      setCounts((c) => ({ ...c, [i.id]: Math.max(1, Number(e.target.value) || 1) }))
                    }
                  />
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground p-6 text-center">Žiadne položky.</p>
            )}
          </CardContent>
        </Card>

        {toPrint.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Náhľad nižšie — pri tlači sa vytlačí {totalLabels} štítkov (4 stĺpce na A4). Default počet = stav skladom, môžete ho ručne upraviť.
          </div>
        )}

        {/* On-screen preview (also printed) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {toPrint.map((i) => (
            <LabelCard key={i.id} item={i} qty={getQty(i)} />
          ))}
        </div>
      </div>

      {/* Print-only sheet */}
      <div className="qr-print-sheet hidden bg-white text-black">
        {Array.from({ length: Math.ceil(printLabels.length / 24) }).map((_, pageIdx) => {
          const pageLabels = printLabels.slice(pageIdx * 24, pageIdx * 24 + 24);
          return (
            <div key={pageIdx} className="qr-print-page">
              <div className="grid grid-cols-4 grid-rows-6 gap-3 h-full">
                {pageLabels.map((i, idx) => (
                  <PrintLabelCard key={`${i.id}-${pageIdx}-${idx}`} item={i} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          html, body { background: #fff !important; margin: 0 !important; }
          body * { visibility: hidden !important; }
          .qr-print-sheet, .qr-print-sheet * { visibility: visible !important; }
          .qr-print-sheet {
            display: block !important;
            position: static !important;
            width: 190mm !important;
            margin: 0 auto !important;
            background: #fff !important;
            color: #000 !important;
          }
          .qr-print-page {
            width: 190mm;
            height: 277mm;
            display: block;
            page-break-after: always;
            break-after: page;
            break-inside: avoid;
            overflow: hidden;
            box-sizing: border-box;
          }
          .qr-print-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>
    </>
  );
}

function LabelCard({ item, qty }: { item: Row; qty: number }) {
  return (
    <div className="border rounded-md p-2 flex flex-col items-center text-center bg-card relative">
      {qty > 1 && (
        <Badge variant="secondary" className="absolute top-1 right-1 text-[10px]">×{qty}</Badge>
      )}
      <QRCode value={buildFurnitureScanUrl(item.id)} size={140} />
      <div className="mt-2 w-full">
        <div className="text-xs font-semibold truncate" title={item.name}>{item.name}</div>
        <div className="text-[10px] font-mono text-muted-foreground">{item.internal_code}</div>
      </div>
    </div>
  );
}

function PrintLabelCard({ item }: { item: PrintLabel }) {
  return (
    <div className="border border-neutral-300 rounded-md p-2 flex flex-col items-center text-center break-inside-avoid bg-white">
      <img src={item.dataUrl} alt={`QR: ${item.name}`} width={140} height={140} />
      <div className="mt-2 w-full">
        <div className="text-xs font-semibold truncate" title={item.name}>{item.name}</div>
        <div className="text-[10px] font-mono text-neutral-600">
          {item.internal_code}
          {item.copyTotal > 1 ? ` · ${item.copyIndex}/${item.copyTotal}` : ""}
        </div>
      </div>
    </div>
  );
}

function writePrintDocument(printWindow: Window, labels: PrintLabel[]) {
  const pages = chunk(labels, 24);
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="sk">
<head>
  <meta charset="utf-8" />
  <title>Tlač QR štítkov</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, sans-serif; }
    .page { width: 190mm; height: 277mm; display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(6, 1fr); gap: 3mm; page-break-after: always; break-after: page; overflow: hidden; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .label { border: 1px solid #d4d4d4; border-radius: 4px; padding: 2mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; overflow: hidden; break-inside: avoid; }
    .label img { width: 32mm; height: 32mm; display: block; }
    .name { width: 100%; margin-top: 2mm; font-size: 9px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .code { margin-top: 1mm; font-size: 8px; color: #525252; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  </style>
</head>
<body>
  ${pages
    .map(
      (page) => `<section class="page">${page
        .map(
          (item) => `<article class="label">
            <img src="${item.dataUrl}" alt="QR" />
            <div class="name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            <div class="code">${escapeHtml(item.internal_code)}${item.copyTotal > 1 ? ` · ${item.copyIndex}/${item.copyTotal}` : ""}</div>
          </article>`,
        )
        .join("")}</section>`,
    )
    .join("")}
  <script>
    window.onload = () => setTimeout(() => { window.focus(); window.print(); }, 150);
  </script>
</body>
</html>`);
  printWindow.document.close();
}

function chunk<T>(items: T[], size: number) {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}