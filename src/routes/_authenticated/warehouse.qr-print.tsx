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

export const Route = createFileRoute("/_authenticated/warehouse/qr-print")({
  head: () => ({ meta: [{ title: "Tlač QR štítkov · Mima Production CRM" }] }),
  component: QrPrint,
});

type Row = {
  id: string;
  name: string;
  internal_code: string;
  furniture_categories: { name: string } | null;
};

function QrPrint() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const items = useQuery({
    queryKey: ["furniture_qr_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("furniture_items")
        .select("id, name, internal_code, furniture_categories(name)")
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

  return (
    <>
      <AppHeader title="Tlač QR štítkov" />
      <div className="p-4 md:p-6 space-y-4 print:hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/warehouse"><ArrowLeft className="size-4 mr-1" />Sklad</Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>Označiť všetky</Button>
            <Button variant="outline" size="sm" onClick={clearAll} disabled={selected.size === 0}>Zrušiť výber</Button>
            <Button size="sm" onClick={() => window.print()} disabled={toPrint.length === 0}>
              <Printer className="size-4 mr-1" /> Tlačiť ({toPrint.length})
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
              <label key={i.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50">
                <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggle(i.id)} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{i.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{i.internal_code}</div>
                </div>
                <Badge variant="outline">{i.furniture_categories?.name ?? "—"}</Badge>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground p-6 text-center">Žiadne položky.</p>
            )}
          </CardContent>
        </Card>

        {toPrint.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Náhľad nižšie — pri tlači sa zobrazia len QR štítky (4 stĺpce na A4).
          </div>
        )}

        {/* On-screen preview (also printed) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {toPrint.map((i) => (
            <LabelCard key={i.id} item={i} />
          ))}
        </div>
      </div>

      {/* Print-only sheet */}
      <div className="hidden print:block p-6 bg-white text-black">
        <div className="grid grid-cols-4 gap-4">
          {toPrint.map((i) => (
            <LabelCard key={i.id} item={i} print />
          ))}
        </div>
      </div>
    </>
  );
}

function LabelCard({ item, print }: { item: Row; print?: boolean }) {
  return (
    <div className={`border rounded-md p-2 flex flex-col items-center text-center ${print ? "break-inside-avoid bg-white" : "bg-card"}`}>
      <QRCode value={buildFurnitureScanUrl(item.id)} size={140} />
      <div className="mt-2 w-full">
        <div className="text-xs font-semibold truncate" title={item.name}>{item.name}</div>
        <div className="text-[10px] font-mono text-muted-foreground">{item.internal_code}</div>
      </div>
    </div>
  );
}