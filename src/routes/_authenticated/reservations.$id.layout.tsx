import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft, Save, Printer, FileImage, FileText, Trash2, RotateCw,
  Square, Circle, Armchair, Users, DoorOpen, Music, Crown, Plus, Minus,
  AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, AlignStartVertical, AlignStartHorizontal, LayoutGrid, Theater, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({ view: z.coerce.boolean().optional() });

export const Route = createFileRoute("/_authenticated/reservations/$id/layout")({
  head: () => ({ meta: [{ title: "Plán rozloženia · MimaProduction CRM" }] }),
  validateSearch: searchSchema,
  component: LayoutEditor,
});

// ---------------- Types ----------------
type ElType =
  | "rect_table"
  | "chair"
  | "round_table"
  | "round_table_chairs"
  | "stage"
  | "zone_podium"
  | "zone_entry"
  | "zone_vip"
  | "zone_custom";

interface LayoutElement {
  id: string;
  type: ElType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  color?: string;
  chairCount?: number;
}

interface LayoutData {
  width: number;
  height: number;
  elements: LayoutElement[];
}

const CANVAS_W = 1400;
const CANVAS_H = 900;
const GRID = 20;

const ZONE_COLORS: Record<string, string> = {
  zone_podium: "#fb923c",
  zone_entry: "#22c55e",
  zone_vip: "#a855f7",
  zone_custom: "#0ea5e9",
};

const PALETTE: { type: ElType; label: string; icon: any; defaults: Partial<LayoutElement> }[] = [
  { type: "rect_table", label: "Stôl (obdĺžnik)", icon: Square, defaults: { w: 160, h: 80 } },
  { type: "round_table", label: "Okrúhly stôl", icon: Circle, defaults: { w: 100, h: 100 } },
  { type: "round_table_chairs", label: "Stôl so stoličkami", icon: Users, defaults: { w: 140, h: 140, chairCount: 8 } },
  { type: "chair", label: "Stolička", icon: Armchair, defaults: { w: 40, h: 40 } },
  { type: "stage", label: "Pódium / Stage", icon: Theater, defaults: { w: 320, h: 140, label: "PÓDIUM" } },
  { type: "zone_podium", label: "Zóna: Pódium", icon: Music, defaults: { w: 280, h: 160, label: "Pódium" } },
  { type: "zone_entry", label: "Zóna: Vstup", icon: DoorOpen, defaults: { w: 200, h: 120, label: "Vstup" } },
  { type: "zone_vip", label: "Zóna: VIP sedenie", icon: Crown, defaults: { w: 280, h: 200, label: "VIP" } },
  { type: "zone_custom", label: "Vlastná zóna", icon: Square, defaults: { w: 240, h: 160, label: "Zóna" } },
];

function isZone(t: ElType) { return t.startsWith("zone_"); }
function isResizable(_t: ElType) { return true; }
function isTable(t: ElType) { return t === "rect_table" || t === "round_table" || t === "round_table_chairs"; }

function snap(v: number) { return Math.round(v / GRID) * GRID; }
function uid() { return Math.random().toString(36).slice(2, 10); }

// ---------------- Component ----------------
function LayoutEditor() {
  const { id } = Route.useParams();
  const { view } = Route.useSearch();
  const navigate = useNavigate();
  const readOnly = !!view;
  const qc = useQueryClient();

  const reservation = useQuery({
    queryKey: ["reservation-layout", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, event_name, venue, layout")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [layout, setLayout] = useState<LayoutData>({ width: CANVAS_W, height: CANVAS_H, elements: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!reservation.data || loaded) return;
    const existing = reservation.data.layout as LayoutData | null;
    if (existing && Array.isArray(existing.elements)) {
      setLayout({ width: existing.width || CANVAS_W, height: existing.height || CANVAS_H, elements: existing.elements });
    }
    setLoaded(true);
  }, [reservation.data, loaded]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("reservations").update({ layout: layout as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plán uložený"); qc.invalidateQueries({ queryKey: ["reservation-layout", id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const selected = useMemo(() => layout.elements.find((e) => e.id === selectedId) ?? null, [layout, selectedId]);

  function updateEl(id: string, patch: Partial<LayoutElement>) {
    setLayout((l) => ({ ...l, elements: l.elements.map((e) => e.id === id ? { ...e, ...patch } : e) }));
  }
  function removeEl(id: string) {
    setLayout((l) => ({ ...l, elements: l.elements.filter((e) => e.id !== id) }));
    setSelectedId(null);
  }
  function duplicateEl(id: string) {
    setLayout((l) => {
      const src = l.elements.find((e) => e.id === id);
      if (!src) return l;
      const copy: LayoutElement = { ...src, id: uid(), x: snap(src.x + 30), y: snap(src.y + 30) };
      setSelectedId(copy.id);
      return { ...l, elements: [...l.elements, copy] };
    });
  }
  function addEl(type: ElType, x = 100, y = 100) {
    const def = PALETTE.find((p) => p.type === type)!;
    const el: LayoutElement = {
      id: uid(), type, x: snap(x), y: snap(y),
      w: def.defaults.w ?? 100, h: def.defaults.h ?? 100,
      rotation: 0, label: def.defaults.label, chairCount: def.defaults.chairCount,
      color: isZone(type) ? ZONE_COLORS[type] : undefined,
    };
    setLayout((l) => ({ ...l, elements: [...l.elements, el] }));
    setSelectedId(el.id);
  }

  // ---- Alignment helpers (operate on tables) ----
  function withTables(fn: (tables: LayoutElement[]) => LayoutElement[]) {
    setLayout((l) => {
      const tables = l.elements.filter((e) => isTable(e.type));
      if (tables.length === 0) { toast.info("Žiadne stoly na zarovnanie."); return l; }
      const updated = fn(tables);
      const map = new Map(updated.map((e) => [e.id, e]));
      return { ...l, elements: l.elements.map((e) => map.get(e.id) ?? e) };
    });
  }
  function alignTables(mode: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter" | "distH" | "distV") {
    withTables((tables) => {
      if (mode === "left") {
        const x = Math.min(...tables.map((t) => t.x));
        return tables.map((t) => ({ ...t, x: snap(x) }));
      }
      if (mode === "right") {
        const r = Math.max(...tables.map((t) => t.x + t.w));
        return tables.map((t) => ({ ...t, x: snap(r - t.w) }));
      }
      if (mode === "top") {
        const y = Math.min(...tables.map((t) => t.y));
        return tables.map((t) => ({ ...t, y: snap(y) }));
      }
      if (mode === "bottom") {
        const b = Math.max(...tables.map((t) => t.y + t.h));
        return tables.map((t) => ({ ...t, y: snap(b - t.h) }));
      }
      if (mode === "hcenter") {
        const cx = tables.reduce((s, t) => s + t.x + t.w / 2, 0) / tables.length;
        return tables.map((t) => ({ ...t, x: snap(cx - t.w / 2) }));
      }
      if (mode === "vcenter") {
        const cy = tables.reduce((s, t) => s + t.y + t.h / 2, 0) / tables.length;
        return tables.map((t) => ({ ...t, y: snap(cy - t.h / 2) }));
      }
      if (mode === "distH" && tables.length >= 3) {
        const sorted = [...tables].sort((a, b) => a.x - b.x);
        const first = sorted[0], last = sorted[sorted.length - 1];
        const totalW = sorted.reduce((s, t) => s + t.w, 0);
        const span = (last.x + last.w) - first.x;
        const gap = (span - totalW) / (sorted.length - 1);
        let cursor = first.x;
        return sorted.map((t) => { const nt = { ...t, x: snap(cursor) }; cursor += t.w + gap; return nt; });
      }
      if (mode === "distV" && tables.length >= 3) {
        const sorted = [...tables].sort((a, b) => a.y - b.y);
        const first = sorted[0], last = sorted[sorted.length - 1];
        const totalH = sorted.reduce((s, t) => s + t.h, 0);
        const span = (last.y + last.h) - first.y;
        const gap = (span - totalH) / (sorted.length - 1);
        let cursor = first.y;
        return sorted.map((t) => { const nt = { ...t, y: snap(cursor) }; cursor += t.h + gap; return nt; });
      }
      return tables;
    });
  }
  function arrangeTablesGrid() {
    withTables((tables) => {
      const maxW = Math.max(...tables.map((t) => t.w));
      const maxH = Math.max(...tables.map((t) => t.h));
      const gap = 40;
      const cellW = maxW + gap, cellH = maxH + gap;
      const cols = Math.max(1, Math.floor((layout.width - gap) / cellW));
      const startX = snap((layout.width - (Math.min(tables.length, cols) * cellW - gap)) / 2);
      const startY = 80;
      return tables.map((t, i) => ({
        ...t,
        x: snap(startX + (i % cols) * cellW + (maxW - t.w) / 2),
        y: snap(startY + Math.floor(i / cols) * cellH + (maxH - t.h) / 2),
      }));
    });
    toast.success("Stoly zarovnané do mriežky");
  }

  // Delete key
  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      if (!selectedId) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeEl(selectedId); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateEl(selectedId); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, readOnly]);

  const canvasRef = useRef<HTMLDivElement>(null);

  async function exportPng() {
    const node = canvasRef.current; if (!node) return;
    const { exportLayoutAsPng } = await import("@/lib/layout-export.client");
    await exportLayoutAsPng({ node, filename: `plan-${reservation.data?.event_name ?? id}`, width: layout.width, height: layout.height });
  }
  async function exportPdf() {
    const node = canvasRef.current; if (!node) return;
    const { exportLayoutAsPdf } = await import("@/lib/layout-export.client");
    await exportLayoutAsPdf({ node, filename: `plan-${reservation.data?.event_name ?? id}`, width: layout.width, height: layout.height });
  }

  // Drag from palette
  function onPaletteDragStart(e: React.DragEvent, type: ElType) {
    e.dataTransfer.setData("text/plain", type);
  }
  function onCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData("text/plain") as ElType;
    if (!type) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const scale = rect.width / layout.width;
    addEl(type, (e.clientX - rect.left) / scale - 40, (e.clientY - rect.top) / scale - 40);
  }

  return (
    <>
      <AppHeader title={`Plán: ${reservation.data?.event_name ?? "…"}`} />
      <div className="p-4 md:p-6 space-y-4 print:p-0">
        {!readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/reservations/$id" params={{ id }}><ArrowLeft className="size-4 mr-1" />Späť na rezerváciu</Link>
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate({ to: "/reservations/$id/layout", params: { id }, search: { view: true } })}>
                <Printer className="size-4 mr-1" />Náhľad / Tlač
              </Button>
              <Button variant="outline" size="sm" onClick={exportPng}><FileImage className="size-4 mr-1" />PNG</Button>
              <Button variant="outline" size="sm" onClick={exportPdf}><FileText className="size-4 mr-1" />PDF</Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="size-4 mr-1" />{save.isPending ? "Ukladám…" : "Uložiť plán"}
              </Button>
            </div>
          </div>
        )}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-2 print:hidden">
            <span className="text-xs text-muted-foreground mr-2 px-1">Zarovnať stoly:</span>
            <Button variant="ghost" size="sm" onClick={() => alignTables("left")} title="Zarovnať vľavo"><AlignStartVertical className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => alignTables("hcenter")} title="Centrovať horizontálne"><AlignHorizontalJustifyCenter className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => alignTables("right")} title="Zarovnať vpravo"><AlignStartVertical className="size-4 rotate-180" /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={() => alignTables("top")} title="Zarovnať hore"><AlignStartHorizontal className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => alignTables("vcenter")} title="Centrovať vertikálne"><AlignVerticalJustifyCenter className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => alignTables("bottom")} title="Zarovnať dole"><AlignStartHorizontal className="size-4 rotate-180" /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={() => alignTables("distH")} title="Rovnomerne horizontálne">↔ rozložiť</Button>
            <Button variant="ghost" size="sm" onClick={() => alignTables("distV")} title="Rovnomerne vertikálne">↕ rozložiť</Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="outline" size="sm" onClick={arrangeTablesGrid} title="Usporiadať do mriežky"><LayoutGrid className="size-4 mr-1" />Mriežka</Button>
          </div>
        )}
        {readOnly && (
          <div className="flex items-center justify-between gap-2 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/reservations/$id/layout", params: { id }, search: {} })}>
              <ArrowLeft className="size-4 mr-1" />Späť do editora
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4 mr-1" />Tlač</Button>
              <Button variant="outline" size="sm" onClick={exportPng}><FileImage className="size-4 mr-1" />PNG</Button>
              <Button variant="outline" size="sm" onClick={exportPdf}><FileText className="size-4 mr-1" />PDF</Button>
            </div>
          </div>
        )}

        <div className={readOnly ? "" : "grid gap-4 lg:grid-cols-[220px_1fr_280px]"}>
          {!readOnly && (
            <Card className="print:hidden">
              <CardContent className="p-3 space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Paleta</div>
                {PALETTE.map((p) => (
                  <div
                    key={p.type}
                    draggable
                    onDragStart={(e) => onPaletteDragStart(e, p.type)}
                    onDoubleClick={() => addEl(p.type, 200, 200)}
                    className="flex items-center gap-2 p-2 rounded-md border cursor-grab hover:bg-muted/60 active:cursor-grabbing select-none"
                    title="Pretiahnite na plátno alebo dvojklik"
                  >
                    <p.icon className="size-4 shrink-0" />
                    <span className="text-xs">{p.label}</span>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground pt-1">Pretiahnite prvok na plátno. Klávesa Delete vymaže označený prvok.</p>
              </CardContent>
            </Card>
          )}

          <div className="overflow-auto rounded-lg border bg-white">
            <div
              ref={canvasRef}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onCanvasDrop}
              onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
              className="relative bg-white"
              style={{
                width: layout.width, height: layout.height,
                backgroundImage: readOnly ? undefined :
                  `linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)`,
                backgroundSize: `${GRID}px ${GRID}px`,
              }}
            >
              {layout.elements.map((el) => (
                <ElementNode
                  key={el.id}
                  el={el}
                  selected={!readOnly && selectedId === el.id}
                  readOnly={readOnly}
                  onSelect={() => setSelectedId(el.id)}
                  onChange={(patch) => updateEl(el.id, patch)}
                />
              ))}
            </div>
          </div>

          {!readOnly && (
            <Card className="print:hidden">
              <CardContent className="p-3 space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Vlastnosti</div>
                {!selected && <p className="text-xs text-muted-foreground">Označte prvok na plátne.</p>}
                {selected && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Popis / číslo</Label>
                      <Input value={selected.label ?? ""} onChange={(e) => updateEl(selected.id, { label: e.target.value })} placeholder="napr. Stôl 5" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Šírka</Label>
                        <Input type="number" value={selected.w} disabled={!isResizable(selected.type)}
                          onChange={(e) => updateEl(selected.id, { w: Math.max(20, Number(e.target.value)) })} />
                      </div>
                      <div>
                        <Label className="text-xs">Výška</Label>
                        <Input type="number" value={selected.h} disabled={!isResizable(selected.type)}
                          onChange={(e) => updateEl(selected.id, { h: Math.max(20, Number(e.target.value)) })} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1"><RotateCw className="size-3" />Otočenie: {selected.rotation}°</Label>
                      <input type="range" min={0} max={360} step={5} value={selected.rotation}
                        onChange={(e) => updateEl(selected.id, { rotation: Number(e.target.value) })} className="w-full" />
                    </div>
                    {selected.type === "round_table_chairs" && (
                      <div>
                        <Label className="text-xs">Počet stoličiek: {selected.chairCount ?? 0}</Label>
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="outline" className="size-7" onClick={() => updateEl(selected.id, { chairCount: Math.max(2, (selected.chairCount ?? 8) - 1) })}><Minus className="size-3" /></Button>
                          <span className="text-sm">{selected.chairCount ?? 8}</span>
                          <Button size="icon" variant="outline" className="size-7" onClick={() => updateEl(selected.id, { chairCount: Math.min(20, (selected.chairCount ?? 8) + 1) })}><Plus className="size-3" /></Button>
                        </div>
                      </div>
                    )}
                    {isZone(selected.type) && (
                      <div>
                        <Label className="text-xs">Farba zóny</Label>
                        <input type="color" value={selected.color ?? "#0ea5e9"} onChange={(e) => updateEl(selected.id, { color: e.target.value })} className="w-full h-8 rounded border" />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => duplicateEl(selected.id)}>
                        <Copy className="size-4 mr-1" />Kopírovať
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => removeEl(selected.id)}>
                        <Trash2 className="size-4 mr-1" />Vymazať
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Tip: Ctrl/Cmd + D duplikuje označený prvok.</p>
                  </div>
                )}

                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Legenda</div>
                  {[
                    ["Pódium", ZONE_COLORS.zone_podium],
                    ["Vstup", ZONE_COLORS.zone_entry],
                    ["VIP", ZONE_COLORS.zone_vip],
                  ].map(([name, color]) => (
                    <div key={name} className="flex items-center gap-2 text-xs">
                      <span className="inline-block size-3 rounded" style={{ background: color }} />
                      {name}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------- Element rendering + drag ----------------
function ElementNode({
  el, selected, readOnly, onSelect, onChange,
}: {
  el: LayoutElement; selected: boolean; readOnly: boolean;
  onSelect: () => void; onChange: (patch: Partial<LayoutElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function startDrag(e: React.PointerEvent, mode: "move" | "resize") {
    if (readOnly) return;
    e.stopPropagation();
    onSelect();
    const startX = e.clientX, startY = e.clientY;
    const orig = { x: el.x, y: el.y, w: el.w, h: el.h };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (mode === "move") {
        onChange({ x: snap(orig.x + dx), y: snap(orig.y + dy) });
      } else {
        onChange({ w: Math.max(20, snap(orig.w + dx)), h: Math.max(20, snap(orig.h + dy)) });
      }
    }
    function onUp() {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const baseStyle: React.CSSProperties = {
    position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
    transform: `rotate(${el.rotation}deg)`, transformOrigin: "center",
    touchAction: "none",
  };

  return (
    <div
      ref={ref}
      style={baseStyle}
      onPointerDown={(e) => startDrag(e, "move")}
      className={`${selected ? "outline outline-2 outline-primary" : ""} ${readOnly ? "" : "cursor-move"}`}
    >
      <ElementVisual el={el} />
      {selected && isResizable(el.type) && (
        <div
          onPointerDown={(e) => startDrag(e, "resize")}
          className="absolute -right-1 -bottom-1 size-3 bg-primary rounded-sm cursor-se-resize"
          style={{ touchAction: "none" }}
        />
      )}
    </div>
  );
}

function ElementVisual({ el }: { el: LayoutElement }) {
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#1f2937" };

  if (el.type === "chair") {
    return (
      <div className="w-full h-full rounded-md bg-slate-200 border border-slate-400 grid place-items-center" style={labelStyle}>
        {el.label}
      </div>
    );
  }
  if (el.type === "rect_table") {
    return (
      <div className="w-full h-full rounded-md bg-amber-100 border-2 border-amber-700 grid place-items-center" style={labelStyle}>
        {el.label || "Stôl"}
      </div>
    );
  }
  if (el.type === "round_table") {
    return (
      <div className="w-full h-full rounded-full bg-amber-100 border-2 border-amber-700 grid place-items-center" style={labelStyle}>
        {el.label || "Stôl"}
      </div>
    );
  }
  if (el.type === "round_table_chairs") {
    const n = el.chairCount ?? 8;
    const tableSize = Math.min(el.w, el.h) * 0.55;
    const chairSize = Math.min(el.w, el.h) * 0.18;
    const radius = Math.min(el.w, el.h) / 2 - chairSize / 2;
    return (
      <div className="relative w-full h-full">
        {Array.from({ length: n }).map((_, i) => {
          const angle = (i / n) * Math.PI * 2;
          const cx = el.w / 2 + Math.cos(angle) * radius - chairSize / 2;
          const cy = el.h / 2 + Math.sin(angle) * radius - chairSize / 2;
          return (
            <div key={i} className="absolute rounded bg-slate-200 border border-slate-400"
              style={{ left: cx, top: cy, width: chairSize, height: chairSize }} />
          );
        })}
        <div
          className="absolute rounded-full bg-amber-100 border-2 border-amber-700 grid place-items-center"
          style={{ left: (el.w - tableSize) / 2, top: (el.h - tableSize) / 2, width: tableSize, height: tableSize, ...labelStyle }}
        >
          {el.label || "Stôl"}
        </div>
      </div>
    );
  }
  if (el.type === "stage") {
    return (
      <div
        className="w-full h-full rounded-md grid place-items-center text-white font-bold tracking-widest shadow-md"
        style={{
          background: "repeating-linear-gradient(90deg, #1f2937 0 24px, #111827 24px 48px)",
          border: "3px solid #f59e0b",
          fontSize: 14,
          letterSpacing: 3,
        }}
      >
        🎤 {el.label || "PÓDIUM"}
      </div>
    );
  }
  // zones
  const color = el.color ?? "#0ea5e9";
  return (
    <div
      className="w-full h-full rounded-lg grid place-items-center font-semibold text-sm"
      style={{ backgroundColor: `${color}33`, border: `2px dashed ${color}`, color }}
    >
      {el.label || "Zóna"}
    </div>
  );
}