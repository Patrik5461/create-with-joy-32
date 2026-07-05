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
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({ view: z.coerce.boolean().optional() });

export const Route = createFileRoute("/_authenticated/reservations/$id/layout")({
  head: () => ({ meta: [{ title: "Plán rozloženia · Mima Production CRM" }] }),
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
  schemaVersion?: number;
}

// ---------------- Zod validation ----------------
const ElTypeSchema = z.enum([
  "rect_table", "chair", "round_table", "round_table_chairs", "stage",
  "zone_podium", "zone_entry", "zone_vip", "zone_custom",
]);
const LayoutElementSchema = z.object({
  id: z.string(),
  type: ElTypeSchema,
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number(),
  label: z.string().optional(),
  color: z.string().optional(),
  chairCount: z.number().optional(),
});
const LayoutDataSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  elements: z.array(LayoutElementSchema),
  schemaVersion: z.number().optional().default(1),
});

function parseLayout(raw: unknown): { layout: LayoutData | null; invalid: boolean } {
  if (raw === null || raw === undefined) return { layout: null, invalid: false };
  const res = LayoutDataSchema.safeParse(raw);
  if (!res.success) return { layout: null, invalid: true };
  return { layout: { ...res.data, schemaVersion: res.data.schemaVersion ?? 1 }, invalid: false };
}

interface ExportLayoutOptions {
  layout: LayoutData;
  filename: string;
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

function escapeXml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

function layoutToSvg(layout: LayoutData) {
  const gridLines: string[] = [];
  for (let x = 0; x <= layout.width; x += GRID) gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${layout.height}" stroke="#e5e7eb" stroke-width="1"/>`);
  for (let y = 0; y <= layout.height; y += GRID) gridLines.push(`<line x1="0" y1="${y}" x2="${layout.width}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);

  const elements = layout.elements.map((el) => {
    const label = escapeXml(el.label || (isZone(el.type) ? "Zóna" : el.type === "stage" ? "PÓDIUM" : el.type === "chair" ? "" : "Stôl"));
    const transform = `translate(${el.x} ${el.y}) rotate(${el.rotation} ${el.w / 2} ${el.h / 2})`;

    if (el.type === "chair") {
      return `<g transform="${transform}"><rect width="${el.w}" height="${el.h}" rx="6" fill="#e2e8f0" stroke="#94a3b8"/><text x="${el.w / 2}" y="${el.h / 2 + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#1f2937">${label}</text></g>`;
    }
    if (el.type === "rect_table") {
      return `<g transform="${transform}"><rect width="${el.w}" height="${el.h}" rx="6" fill="#fef3c7" stroke="#b45309" stroke-width="2"/><text x="${el.w / 2}" y="${el.h / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#1f2937">${label}</text></g>`;
    }
    if (el.type === "round_table") {
      return `<g transform="${transform}"><ellipse cx="${el.w / 2}" cy="${el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" fill="#fef3c7" stroke="#b45309" stroke-width="2"/><text x="${el.w / 2}" y="${el.h / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#1f2937">${label}</text></g>`;
    }
    if (el.type === "round_table_chairs") {
      const n = el.chairCount ?? 8;
      const tableSize = Math.min(el.w, el.h) * 0.55;
      const chairSize = Math.min(el.w, el.h) * 0.18;
      const radius = Math.min(el.w, el.h) / 2 - chairSize / 2;
      const chairs = Array.from({ length: n }).map((_, i) => {
        const angle = (i / n) * Math.PI * 2;
        const x = el.w / 2 + Math.cos(angle) * radius - chairSize / 2;
        const y = el.h / 2 + Math.sin(angle) * radius - chairSize / 2;
        return `<rect x="${x}" y="${y}" width="${chairSize}" height="${chairSize}" rx="4" fill="#e2e8f0" stroke="#94a3b8"/>`;
      }).join("");
      return `<g transform="${transform}">${chairs}<circle cx="${el.w / 2}" cy="${el.h / 2}" r="${tableSize / 2}" fill="#fef3c7" stroke="#b45309" stroke-width="2"/><text x="${el.w / 2}" y="${el.h / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#1f2937">${label}</text></g>`;
    }
    if (el.type === "stage") {
      return `<g transform="${transform}"><rect width="${el.w}" height="${el.h}" rx="6" fill="#111827" stroke="#f59e0b" stroke-width="3"/><path d="${Array.from({ length: Math.ceil(el.w / 48) }).map((_, i) => `M ${i * 48 + 24} 0 V ${el.h}`).join(" ")}" stroke="#1f2937" stroke-width="24"/><text x="${el.w / 2}" y="${el.h / 2 + 5}" text-anchor="middle" font-size="14" font-weight="800" letter-spacing="3" fill="#ffffff">${label}</text></g>`;
    }

    const color = el.color ?? "#0ea5e9";
    return `<g transform="${transform}"><rect width="${el.w}" height="${el.h}" rx="8" fill="${color}33" stroke="${color}" stroke-width="2" stroke-dasharray="8 6"/><text x="${el.w / 2}" y="${el.h / 2 + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${color}">${label}</text></g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}"><rect width="100%" height="100%" fill="#ffffff"/>${gridLines.join("")}${elements}</svg>`;
}

async function exportLayoutAsPng({ layout, filename }: ExportLayoutOptions) {
  if (typeof document === "undefined") return;
  const svg = layoutToSvg(layout);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = layout.width * 2;
      canvas.height = layout.height * 2;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas export nie je dostupný."));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(2, 2);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Export obrázka zlyhal."));
    };
    image.src = url;
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${filename}.png`;
  link.click();
}

async function exportLayoutAsPdf({ layout, filename }: ExportLayoutOptions) {
  if (typeof window === "undefined") return;
  const svg = layoutToSvg(layout);
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=800");
  if (!printWindow) throw new Error("Prehliadač zablokoval otvorenie okna pre PDF export.");
  printWindow.document.write(`<!doctype html><html><head><title>${escapeXml(filename)}</title><style>@page{size:landscape;margin:10mm}body{margin:0;background:#fff;font-family:Arial,sans-serif}.wrap{width:100vw;height:100vh;display:grid;place-items:center}svg{max-width:100%;max-height:100%;width:auto;height:auto}</style></head><body><div class="wrap">${svg}</div><script>window.onload=()=>{window.focus();window.print();};</script></body></html>`);
  printWindow.document.close();
}

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

  const [layout, setLayout] = useState<LayoutData>({ width: CANVAS_W, height: CANVAS_H, elements: [], schemaVersion: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [invalidLoaded, setInvalidLoaded] = useState(false);

  // ---- Undo/Redo history ----
  const historyRef = useRef<{ stack: LayoutData[]; idx: number }>({ stack: [], idx: -1 });
  const [historyTick, setHistoryTick] = useState(0);
  const canUndo = historyRef.current.idx > 0;
  const canRedo = historyRef.current.idx < historyRef.current.stack.length - 1;
  void historyTick;

  function seedHistory(l: LayoutData) {
    historyRef.current = { stack: [l], idx: 0 };
    setHistoryTick((t) => t + 1);
  }
  function commit(next: LayoutData) {
    const h = historyRef.current;
    const trimmed = h.stack.slice(0, h.idx + 1);
    trimmed.push(next);
    const capped = trimmed.slice(-50);
    historyRef.current = { stack: capped, idx: capped.length - 1 };
    setLayout(next);
    setHistoryTick((t) => t + 1);
  }
  function undo() {
    const h = historyRef.current;
    if (h.idx <= 0) return;
    const idx = h.idx - 1;
    historyRef.current = { stack: h.stack, idx };
    setLayout(h.stack[idx]);
    setHistoryTick((t) => t + 1);
  }
  function redo() {
    const h = historyRef.current;
    if (h.idx >= h.stack.length - 1) return;
    const idx = h.idx + 1;
    historyRef.current = { stack: h.stack, idx };
    setLayout(h.stack[idx]);
    setHistoryTick((t) => t + 1);
  }

  // ---- Zoom / viewport ----
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  function clampZoom(z: number) { return Math.max(0.25, Math.min(2, Math.round(z * 100) / 100)); }
  function zoomIn() { setZoom((z) => clampZoom(z * 1.15)); }
  function zoomOut() { setZoom((z) => clampZoom(z / 1.15)); }
  function zoomFit() {
    const vp = viewportRef.current;
    if (!vp) return;
    const zx = vp.clientWidth / (layout.width + 40);
    const zy = vp.clientHeight / (layout.height + 40);
    setZoom(clampZoom(Math.min(zx, zy)));
    requestAnimationFrame(() => { if (vp) { vp.scrollLeft = 0; vp.scrollTop = 0; } });
  }
  function zoomReset() { setZoom(1); }

  useEffect(() => {
    if (!reservation.data || loaded) return;
    const raw = reservation.data.layout as unknown;
    if (raw !== null && raw !== undefined) {
      const { layout: parsed, invalid } = parseLayout(raw);
      if (invalid) {
        setInvalidLoaded(true);
        toast.error("Uložený plán má neplatný formát. Začnite odznova.");
        const empty: LayoutData = { width: CANVAS_W, height: CANVAS_H, elements: [], schemaVersion: 1 };
        setLayout(empty);
        setSavedSnapshot("");
        seedHistory(empty);
      } else if (parsed) {
        const next: LayoutData = {
          width: parsed.width || CANVAS_W,
          height: parsed.height || CANVAS_H,
          elements: parsed.elements,
          schemaVersion: parsed.schemaVersion ?? 1,
        };
        setLayout(next);
        setSavedSnapshot(JSON.stringify(next));
        seedHistory(next);
      } else {
        const empty: LayoutData = { width: CANVAS_W, height: CANVAS_H, elements: [], schemaVersion: 1 };
        setSavedSnapshot(JSON.stringify(empty));
        seedHistory(empty);
      }
    } else {
      const empty: LayoutData = { width: CANVAS_W, height: CANVAS_H, elements: [], schemaVersion: 1 };
      setSavedSnapshot(JSON.stringify(empty));
      seedHistory(empty);
    }
    setLoaded(true);
  }, [reservation.data, loaded]);

  const currentSnapshot = useMemo(() => JSON.stringify(layout), [layout]);
  const isDirty = loaded && !readOnly && savedSnapshot !== "" && currentSnapshot !== savedSnapshot;

  // beforeunload guard
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const save = useMutation({
    mutationFn: async () => {
      const toSave: LayoutData = { ...layout, schemaVersion: 1 };
      const { error } = await supabase.from("reservations").update({ layout: toSave as any }).eq("id", id);
      if (error) throw error;
      return toSave;
    },
    onSuccess: (saved) => {
      toast.success("Plán uložený");
      if (saved) setSavedSnapshot(JSON.stringify(saved));
      qc.invalidateQueries({ queryKey: ["reservation-layout", id] });
      qc.invalidateQueries({ queryKey: ["reservations-for-layouts"] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  void invalidLoaded;

  const selected = useMemo(() => layout.elements.find((e) => e.id === selectedId) ?? null, [layout, selectedId]);

  function updateEl(elId: string, patch: Partial<LayoutElement>) {
    commit({ ...layout, elements: layout.elements.map((e) => e.id === elId ? { ...e, ...patch } : e) });
  }
  function removeEl(elId: string) {
    commit({ ...layout, elements: layout.elements.filter((e) => e.id !== elId) });
    setSelectedId(null);
  }
  function duplicateEl(elId: string) {
    const src = layout.elements.find((e) => e.id === elId);
    if (!src) return;
    const copy: LayoutElement = { ...src, id: uid(), x: snap(src.x + 30), y: snap(src.y + 30) };
    commit({ ...layout, elements: [...layout.elements, copy] });
    setSelectedId(copy.id);
  }
  function addEl(type: ElType, x = 100, y = 100) {
    const def = PALETTE.find((p) => p.type === type)!;
    const el: LayoutElement = {
      id: uid(), type, x: snap(x), y: snap(y),
      w: def.defaults.w ?? 100, h: def.defaults.h ?? 100,
      rotation: 0, label: def.defaults.label, chairCount: def.defaults.chairCount,
      color: isZone(type) ? ZONE_COLORS[type] : undefined,
    };
    commit({ ...layout, elements: [...layout.elements, el] });
    setSelectedId(el.id);
  }
  function addAtViewportCenter(type: ElType) {
    const vp = viewportRef.current;
    const def = PALETTE.find((p) => p.type === type)!;
    const w = def.defaults.w ?? 100, h = def.defaults.h ?? 100;
    if (!vp) { addEl(type, layout.width / 2 - w / 2, layout.height / 2 - h / 2); return; }
    const cxLayout = (vp.scrollLeft + vp.clientWidth / 2) / zoom;
    const cyLayout = (vp.scrollTop + vp.clientHeight / 2) / zoom;
    addEl(type, cxLayout - w / 2, cyLayout - h / 2);
  }

  // ---- Alignment helpers (operate on tables) ----
  function withTables(fn: (tables: LayoutElement[]) => LayoutElement[]) {
    const tables = layout.elements.filter((e) => isTable(e.type));
    if (tables.length === 0) { toast.info("Žiadne stoly na zarovnanie."); return; }
    const updated = fn(tables);
    const map = new Map(updated.map((e) => [e.id, e]));
    commit({ ...layout, elements: layout.elements.map((e) => map.get(e.id) ?? e) });
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
      const tag = (e.target as HTMLElement)?.tagName;
      const inEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      const meta = e.ctrlKey || e.metaKey;
      // Undo / redo work even in editable fields is annoying; skip in inputs
      if (!inEditable && meta && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (!inEditable && meta && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (!selectedId) return;
      if (inEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeEl(selectedId); }
      if (meta && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateEl(selectedId); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, readOnly, layout]);

  const canvasRef = useRef<HTMLDivElement>(null);

  async function exportPng() {
    await exportLayoutAsPng({ layout, filename: `plan-${reservation.data?.event_name ?? id}` });
  }
  async function exportPdf() {
    await exportLayoutAsPdf({ layout, filename: `plan-${reservation.data?.event_name ?? id}` });
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
                <Save className="size-4 mr-1" />
                {save.isPending ? "Ukladám…" : isDirty ? "Uložiť plán •" : "Uložiť plán"}
                {isDirty && !save.isPending && (
                  <span className="ml-2 text-[10px] font-normal opacity-80">Neuložené zmeny</span>
                )}
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
                          <Button size="icon" variant="outline" className="size-7" aria-label="Znížiť počet stoličiek" onClick={() => updateEl(selected.id, { chairCount: Math.max(2, (selected.chairCount ?? 8) - 1) })}><Minus className="size-3" /></Button>
                          <span className="text-sm">{selected.chairCount ?? 8}</span>
                          <Button size="icon" variant="outline" className="size-7" aria-label="Zvýšiť počet stoličiek" onClick={() => updateEl(selected.id, { chairCount: Math.min(20, (selected.chairCount ?? 8) + 1) })}><Plus className="size-3" /></Button>
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
  const [drag, setDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  function startDrag(e: React.PointerEvent, mode: "move" | "resize") {
    if (readOnly) return;
    e.stopPropagation();
    onSelect();
    const startX = e.clientX, startY = e.clientY;
    const orig = { x: el.x, y: el.y, w: el.w, h: el.h };
    const rotated = (((el.rotation % 360) + 360) % 360) !== 0;
    const rad = (el.rotation * Math.PI) / 180;
    const cos = Math.cos(-rad), sin = Math.sin(-rad);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      let next: { x: number; y: number; w: number; h: number };
      if (mode === "move") {
        const nx = rotated ? orig.x + dx : snap(orig.x + dx);
        const ny = rotated ? orig.y + dy : snap(orig.y + dy);
        next = { x: nx, y: ny, w: orig.w, h: orig.h };
      } else {
        // Rotate screen delta to element-local frame, then resize around center
        const ldx = dx * cos - dy * sin;
        const ldy = dx * sin + dy * cos;
        let nw = Math.max(20, orig.w + ldx);
        let nh = Math.max(20, orig.h + ldy);
        if (!rotated) { nw = Math.max(20, snap(nw)); nh = Math.max(20, snap(nh)); }
        const cx = orig.x + orig.w / 2, cy = orig.y + orig.h / 2;
        next = { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
      }
      dragRef.current = next;
      setDrag(next);
    }
    function onUp() {
      const final = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      try { target.releasePointerCapture(e.pointerId); } catch {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (final) onChange(final);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const display = drag ?? { x: el.x, y: el.y, w: el.w, h: el.h };
  const displayEl: LayoutElement = { ...el, ...display };
  const baseStyle: React.CSSProperties = {
    position: "absolute", left: display.x, top: display.y, width: display.w, height: display.h,
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
      <ElementVisual el={displayEl} />
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