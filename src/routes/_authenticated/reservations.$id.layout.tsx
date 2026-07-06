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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Save, Printer, FileImage, FileText, Trash2, RotateCw,
  Square, Circle, Armchair, Users, DoorOpen, Music, Crown, Plus, Minus,
  AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, AlignStartVertical, AlignStartHorizontal, LayoutGrid, Theater, Copy,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Image as ImageIcon, BookOpen, BookmarkPlus, X, Ruler,
  Lock, Unlock, ArrowUpToLine, ArrowDownToLine, Hash,
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

type ChairVariant = "standard" | "bar" | "upholstered";

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
  chairVariant?: ChairVariant;
  z?: number;
  locked?: boolean;
}

interface LayoutData {
  width: number;
  height: number;
  elements: LayoutElement[];
  schemaVersion?: number;
  roomWidthM?: number;
  roomHeightM?: number;
  pxPerMeter?: number;
  backgroundImage?: { path: string; opacity?: number } | null;
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
  chairVariant: z.enum(["standard", "bar", "upholstered"]).optional(),
  z: z.number().optional(),
  locked: z.boolean().optional(),
});
const BackgroundImageSchema = z.object({
  path: z.string(),
  opacity: z.number().min(0).max(1).optional(),
}).nullable().optional();
const LayoutDataSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  elements: z.array(LayoutElementSchema),
  schemaVersion: z.number().optional().default(1),
  roomWidthM: z.number().positive().optional(),
  roomHeightM: z.number().positive().optional(),
  pxPerMeter: z.number().positive().optional(),
  backgroundImage: BackgroundImageSchema,
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
  backgroundDataUrl?: string;
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

const TABLE_DEFAULT_FILL = "#fef3c7";
const TABLE_DEFAULT_STROKE = "#b45309";

const PALETTE: { type: ElType; label: string; icon: any; defaults: Partial<LayoutElement> }[] = [
  { type: "rect_table", label: "Stôl (obdĺžnik)", icon: Square, defaults: { w: 160, h: 80 } },
  { type: "round_table", label: "Okrúhly stôl", icon: Circle, defaults: { w: 100, h: 100 } },
  { type: "round_table_chairs", label: "Stôl so stoličkami", icon: Users, defaults: { w: 140, h: 140, chairCount: 8 } },
  { type: "chair", label: "Stolička", icon: Armchair, defaults: { w: 40, h: 40, chairVariant: "standard" } },
  { type: "stage", label: "Pódium / Stage", icon: Theater, defaults: { w: 320, h: 140, label: "PÓDIUM" } },
  { type: "zone_podium", label: "Zóna: Pódium", icon: Music, defaults: { w: 280, h: 160, label: "Pódium" } },
  { type: "zone_entry", label: "Zóna: Vstup", icon: DoorOpen, defaults: { w: 200, h: 120, label: "Vstup" } },
  { type: "zone_vip", label: "Zóna: VIP sedenie", icon: Crown, defaults: { w: 280, h: 200, label: "VIP" } },
  { type: "zone_custom", label: "Vlastná zóna", icon: Square, defaults: { w: 240, h: 160, label: "Zóna" } },
];

const CHAIR_VARIANT_STYLE: Record<ChairVariant, { fill: string; stroke: string; label: string; badge: string }> = {
  standard:    { fill: "#e2e8f0", stroke: "#94a3b8", label: "Štandard", badge: "" },
  bar:         { fill: "#fde68a", stroke: "#b45309", label: "Barová",   badge: "B" },
  upholstered: { fill: "#c7d2fe", stroke: "#4f46e5", label: "Čalúnená", badge: "Č" },
};

function isZone(t: ElType) { return t.startsWith("zone_"); }
function isResizable(_t: ElType) { return true; }
function isTable(t: ElType) { return t === "rect_table" || t === "round_table" || t === "round_table_chairs"; }

function snap(v: number) { return Math.round(v / GRID) * GRID; }
function uid() { return Math.random().toString(36).slice(2, 10); }

function sortByZ(els: LayoutElement[]): LayoutElement[] {
  return [...els].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
}

function nextMaxZ(els: LayoutElement[]) {
  return els.reduce((m, e) => Math.max(m, e.z ?? 0), 0) + 1;
}
function nextMinZ(els: LayoutElement[]) {
  return els.reduce((m, e) => Math.min(m, e.z ?? 0), 0) - 1;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

async function fetchBackgroundDataUrl(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from("layout-backgrounds")
      .createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("read fail"));
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

function layoutToSvg(layout: LayoutData) {
  const gridLines: string[] = [];
  for (let x = 0; x <= layout.width; x += GRID) gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${layout.height}" stroke="#e5e7eb" stroke-width="1"/>`);
  for (let y = 0; y <= layout.height; y += GRID) gridLines.push(`<line x1="0" y1="${y}" x2="${layout.width}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);

  const backgroundDataUrl = (layout as LayoutData & { __bgDataUrl?: string }).__bgDataUrl;
  const bg = (backgroundDataUrl && layout.backgroundImage)
    ? `<image href="${backgroundDataUrl}" x="0" y="0" width="${layout.width}" height="${layout.height}" opacity="${layout.backgroundImage.opacity ?? 0.5}" preserveAspectRatio="xMidYMid slice"/>`
    : "";

  const room = (layout.roomWidthM && layout.roomHeightM)
    ? `<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="8 6"/><text x="6" y="14" font-size="11" font-weight="600" fill="#475569">${layout.roomWidthM} × ${layout.roomHeightM} m</text>`
    : "";

  const elements = sortByZ(layout.elements).map((el) => {
    const label = escapeXml(el.label || (isZone(el.type) ? "Zóna" : el.type === "stage" ? "PÓDIUM" : el.type === "chair" ? "" : "Stôl"));
    const transform = `translate(${el.x} ${el.y}) rotate(${el.rotation} ${el.w / 2} ${el.h / 2})`;

    if (el.type === "chair") {
      const variant = CHAIR_VARIANT_STYLE[el.chairVariant ?? "standard"];
      const badge = variant.badge ? `<text x="${el.w - 4}" y="10" text-anchor="end" font-size="9" font-weight="800" fill="${variant.stroke}">${variant.badge}</text>` : "";
      return `<g transform="${transform}"><rect width="${el.w}" height="${el.h}" rx="6" fill="${variant.fill}" stroke="${variant.stroke}"/>${badge}<text x="${el.w / 2}" y="${el.h / 2 + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#1f2937">${label}</text></g>`;
    }
    const tableFill = el.color ?? TABLE_DEFAULT_FILL;
    const tableStroke = el.color ? shadeColor(el.color, -30) : TABLE_DEFAULT_STROKE;
    if (el.type === "rect_table") {
      return `<g transform="${transform}"><rect width="${el.w}" height="${el.h}" rx="6" fill="${tableFill}" stroke="${tableStroke}" stroke-width="2"/><text x="${el.w / 2}" y="${el.h / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#1f2937">${label}</text></g>`;
    }
    if (el.type === "round_table") {
      return `<g transform="${transform}"><ellipse cx="${el.w / 2}" cy="${el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" fill="${tableFill}" stroke="${tableStroke}" stroke-width="2"/><text x="${el.w / 2}" y="${el.h / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#1f2937">${label}</text></g>`;
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
      return `<g transform="${transform}">${chairs}<circle cx="${el.w / 2}" cy="${el.h / 2}" r="${tableSize / 2}" fill="${tableFill}" stroke="${tableStroke}" stroke-width="2"/><text x="${el.w / 2}" y="${el.h / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#1f2937">${label}</text></g>`;
    }
    if (el.type === "stage") {
      return `<g transform="${transform}"><rect width="${el.w}" height="${el.h}" rx="6" fill="#111827" stroke="#f59e0b" stroke-width="3"/><path d="${Array.from({ length: Math.ceil(el.w / 48) }).map((_, i) => `M ${i * 48 + 24} 0 V ${el.h}`).join(" ")}" stroke="#1f2937" stroke-width="24"/><text x="${el.w / 2}" y="${el.h / 2 + 5}" text-anchor="middle" font-size="14" font-weight="800" letter-spacing="3" fill="#ffffff">${label}</text></g>`;
    }

    const color = el.color ?? ZONE_COLORS[el.type] ?? "#0ea5e9";
    return `<g transform="${transform}"><rect width="${el.w}" height="${el.h}" rx="8" fill="${color}33" stroke="${color}" stroke-width="2" stroke-dasharray="8 6"/><text x="${el.w / 2}" y="${el.h / 2 + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${color}">${label}</text></g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}"><rect width="100%" height="100%" fill="#ffffff"/>${bg}${gridLines.join("")}${room}${elements}</svg>`;
}

function shadeColor(hex: string, amt: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const num = parseInt(m, 16);
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0xff) + amt;
  let b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

async function exportLayoutAsPng({ layout, filename, backgroundDataUrl }: ExportLayoutOptions) {
  if (typeof document === "undefined") return;
  const svg = layoutToSvg({ ...(layout as any), __bgDataUrl: backgroundDataUrl } as LayoutData);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = layout.width * 2;
      canvas.height = layout.height * 2;
      const context = canvas.getContext("2d");
      if (!context) { reject(new Error("Canvas export nie je dostupný.")); return; }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(2, 2);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Export obrázka zlyhal.")); };
    image.src = url;
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${filename}.png`;
  link.click();
}

async function exportLayoutAsPdf({ layout, filename, backgroundDataUrl }: ExportLayoutOptions) {
  if (typeof window === "undefined") return;
  const svg = layoutToSvg({ ...(layout as any), __bgDataUrl: backgroundDataUrl } as LayoutData);
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

  const [layout, setLayout] = useState<LayoutData>({ width: CANVAS_W, height: CANVAS_H, elements: [], schemaVersion: 2 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [invalidLoaded, setInvalidLoaded] = useState(false);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; elId: string } | null>(null);

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
        const empty: LayoutData = { width: CANVAS_W, height: CANVAS_H, elements: [], schemaVersion: 2 };
        setLayout(empty);
        setSavedSnapshot("");
        seedHistory(empty);
      } else if (parsed) {
        const next: LayoutData = {
          width: parsed.width || CANVAS_W,
          height: parsed.height || CANVAS_H,
          elements: parsed.elements,
          schemaVersion: parsed.schemaVersion ?? 1,
          roomWidthM: parsed.roomWidthM,
          roomHeightM: parsed.roomHeightM,
          pxPerMeter: parsed.pxPerMeter,
          backgroundImage: parsed.backgroundImage ?? null,
        };
        setLayout(next);
        setSavedSnapshot(JSON.stringify(next));
        seedHistory(next);
      } else {
        const empty: LayoutData = { width: CANVAS_W, height: CANVAS_H, elements: [], schemaVersion: 2 };
        setSavedSnapshot(JSON.stringify(empty));
        seedHistory(empty);
      }
    } else {
      const empty: LayoutData = { width: CANVAS_W, height: CANVAS_H, elements: [], schemaVersion: 2 };
      setSavedSnapshot(JSON.stringify(empty));
      seedHistory(empty);
    }
    setLoaded(true);
  }, [reservation.data, loaded]);

  const currentSnapshot = useMemo(() => JSON.stringify(layout), [layout]);
  const isDirty = loaded && !readOnly && savedSnapshot !== "" && currentSnapshot !== savedSnapshot;

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = ""; }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const save = useMutation({
    mutationFn: async () => {
      const toSave: LayoutData = { ...layout, schemaVersion: 2 };
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

  const primaryId = selectedIds.size === 1 ? Array.from(selectedIds)[0] : null;
  const selected = useMemo(() => primaryId ? (layout.elements.find((e) => e.id === primaryId) ?? null) : null, [layout, primaryId]);

  // ---- Capacity ----
  const capacity = useMemo(() => {
    let chairs = 0, tables = 0;
    for (const el of layout.elements) {
      if (el.type === "chair") chairs++;
      else if (el.type === "round_table_chairs") { chairs += el.chairCount ?? 0; tables++; }
      else if (el.type === "rect_table" || el.type === "round_table") tables++;
    }
    return { chairs, tables };
  }, [layout.elements]);

  // ---- Background image signed URL for display ----
  useEffect(() => {
    let cancelled = false;
    const path = layout.backgroundImage?.path;
    if (!path) { setBgUrl(null); return; }
    supabase.storage.from("layout-backgrounds").createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!cancelled) setBgUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [layout.backgroundImage?.path]);

  async function onUploadBackground(file: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Nahrajte prosím obrázok."); return; }
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("layout-backgrounds").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error(error.message); return; }
    const prev = layout.backgroundImage?.path;
    if (prev && prev !== path) supabase.storage.from("layout-backgrounds").remove([prev]).catch(() => {});
    commit({ ...layout, backgroundImage: { path, opacity: layout.backgroundImage?.opacity ?? 0.5 } });
    toast.success("Pôdorys nahraný");
  }
  async function removeBackground() {
    const prev = layout.backgroundImage?.path;
    if (prev) supabase.storage.from("layout-backgrounds").remove([prev]).catch(() => {});
    commit({ ...layout, backgroundImage: null });
  }

  // ---- Templates ----
  const templates = useQuery({
    queryKey: ["layout-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("layout_templates")
        .select("id, name, data, created_by, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const saveAsTemplate = useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Zadajte názov šablóny");
      const payload: LayoutData = { ...layout, schemaVersion: 2 };
      const { error } = await supabase.from("layout_templates").insert({ name: trimmed, data: payload as any });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Šablóna uložená");
      setSaveTemplateOpen(false);
      setNewTemplateName("");
      qc.invalidateQueries({ queryKey: ["layout-templates"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const renameTemplate = useMutation({
    mutationFn: async ({ tid, name }: { tid: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Zadajte názov");
      const { error } = await supabase.from("layout_templates").update({ name: trimmed }).eq("id", tid);
      if (error) throw error;
    },
    onSuccess: () => { setRenamingId(null); qc.invalidateQueries({ queryKey: ["layout-templates"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteTemplate = useMutation({
    mutationFn: async (tid: string) => {
      const { error } = await supabase.from("layout_templates").delete().eq("id", tid);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Šablóna zmazaná"); qc.invalidateQueries({ queryKey: ["layout-templates"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  function loadTemplateInto(tid: string) {
    const tpl = templates.data?.find((t: any) => t.id === tid);
    if (!tpl) return;
    const res = LayoutDataSchema.safeParse(tpl.data);
    if (!res.success) { toast.error("Šablóna má neplatný formát"); return; }
    const hasContent = layout.elements.length > 0 || !!layout.backgroundImage;
    if (hasContent && !window.confirm("Prepísať súčasné rozloženie touto šablónou?")) return;
    const next: LayoutData = { ...res.data, backgroundImage: layout.backgroundImage ?? null, schemaVersion: 2 };
    commit(next);
    setTemplatesOpen(false);
    toast.success(`Šablóna „${tpl.name}“ načítaná`);
  }

  // ---- Element operations ----
  function updateEl(elId: string, patch: Partial<LayoutElement>) {
    commit({ ...layout, elements: layout.elements.map((e) => e.id === elId ? { ...e, ...patch } : e) });
  }
  function updateMany(ids: Set<string>, patchFn: (el: LayoutElement) => Partial<LayoutElement>) {
    commit({ ...layout, elements: layout.elements.map((e) => ids.has(e.id) ? { ...e, ...patchFn(e) } : e) });
  }
  function removeIds(ids: Set<string>) {
    if (ids.size === 0) return;
    commit({ ...layout, elements: layout.elements.filter((e) => !ids.has(e.id) || e.locked) });
    setSelectedIds(new Set());
  }
  function duplicateIds(ids: Set<string>) {
    if (ids.size === 0) return;
    const copies: LayoutElement[] = [];
    for (const el of layout.elements) {
      if (ids.has(el.id)) copies.push({ ...el, id: uid(), x: snap(el.x + 30), y: snap(el.y + 30), locked: false });
    }
    commit({ ...layout, elements: [...layout.elements, ...copies] });
    setSelectedIds(new Set(copies.map((c) => c.id)));
  }
  function toggleLock(elId: string) {
    updateEl(elId, { locked: !layout.elements.find((e) => e.id === elId)?.locked });
  }
  function bringToFront(elId: string) {
    updateEl(elId, { z: nextMaxZ(layout.elements) });
  }
  function sendToBack(elId: string) {
    updateEl(elId, { z: nextMinZ(layout.elements) });
  }
  function addEl(type: ElType, x = 100, y = 100) {
    const def = PALETTE.find((p) => p.type === type)!;
    const el: LayoutElement = {
      id: uid(), type, x: snap(x), y: snap(y),
      w: def.defaults.w ?? 100, h: def.defaults.h ?? 100,
      rotation: 0, label: def.defaults.label, chairCount: def.defaults.chairCount,
      chairVariant: def.defaults.chairVariant,
      color: isZone(type) ? ZONE_COLORS[type] : undefined,
      z: nextMaxZ(layout.elements),
    };
    commit({ ...layout, elements: [...layout.elements, el] });
    setSelectedIds(new Set([el.id]));
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

  function renumberTables() {
    const tables = sortByZ(layout.elements.filter((e) => isTable(e.type)))
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));
    let n = 1;
    const map = new Map<string, string>();
    for (const t of tables) map.set(t.id, String(n++));
    commit({ ...layout, elements: layout.elements.map((e) => map.has(e.id) ? { ...e, label: map.get(e.id) } : e) });
    toast.success(`Prečíslovaných ${map.size} stolov`);
  }

  // ---- Alignment (any selected elements, ≥2) ----
  function alignSelected(mode: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter" | "distH" | "distV") {
    const ids = selectedIds;
    const targets = layout.elements.filter((e) => ids.has(e.id) && !e.locked);
    if (targets.length < 2) { toast.info("Označte aspoň 2 prvky na zarovnanie."); return; }
    let updated: LayoutElement[] = targets;
    if (mode === "left") { const x = Math.min(...targets.map((t) => t.x)); updated = targets.map((t) => ({ ...t, x: snap(x) })); }
    else if (mode === "right") { const r = Math.max(...targets.map((t) => t.x + t.w)); updated = targets.map((t) => ({ ...t, x: snap(r - t.w) })); }
    else if (mode === "top") { const y = Math.min(...targets.map((t) => t.y)); updated = targets.map((t) => ({ ...t, y: snap(y) })); }
    else if (mode === "bottom") { const b = Math.max(...targets.map((t) => t.y + t.h)); updated = targets.map((t) => ({ ...t, y: snap(b - t.h) })); }
    else if (mode === "hcenter") { const cx = targets.reduce((s, t) => s + t.x + t.w / 2, 0) / targets.length; updated = targets.map((t) => ({ ...t, x: snap(cx - t.w / 2) })); }
    else if (mode === "vcenter") { const cy = targets.reduce((s, t) => s + t.y + t.h / 2, 0) / targets.length; updated = targets.map((t) => ({ ...t, y: snap(cy - t.h / 2) })); }
    else if (mode === "distH") {
      if (targets.length < 3) { toast.info("Označte aspoň 3 prvky."); return; }
      const sorted = [...targets].sort((a, b) => a.x - b.x);
      const first = sorted[0], last = sorted[sorted.length - 1];
      const totalW = sorted.reduce((s, t) => s + t.w, 0);
      const span = (last.x + last.w) - first.x;
      const gap = (span - totalW) / (sorted.length - 1);
      let cursor = first.x;
      updated = sorted.map((t) => { const nt = { ...t, x: snap(cursor) }; cursor += t.w + gap; return nt; });
    } else if (mode === "distV") {
      if (targets.length < 3) { toast.info("Označte aspoň 3 prvky."); return; }
      const sorted = [...targets].sort((a, b) => a.y - b.y);
      const first = sorted[0], last = sorted[sorted.length - 1];
      const totalH = sorted.reduce((s, t) => s + t.h, 0);
      const span = (last.y + last.h) - first.y;
      const gap = (span - totalH) / (sorted.length - 1);
      let cursor = first.y;
      updated = sorted.map((t) => { const nt = { ...t, y: snap(cursor) }; cursor += t.h + gap; return nt; });
    }
    const map = new Map(updated.map((e) => [e.id, e]));
    commit({ ...layout, elements: layout.elements.map((e) => map.get(e.id) ?? e) });
  }
  function arrangeTablesGrid() {
    const tables = layout.elements.filter((e) => isTable(e.type) && !e.locked);
    if (tables.length === 0) { toast.info("Žiadne stoly na zarovnanie."); return; }
    const maxW = Math.max(...tables.map((t) => t.w));
    const maxH = Math.max(...tables.map((t) => t.h));
    const gap = 40;
    const cellW = maxW + gap, cellH = maxH + gap;
    const cols = Math.max(1, Math.floor((layout.width - gap) / cellW));
    const startX = snap((layout.width - (Math.min(tables.length, cols) * cellW - gap)) / 2);
    const startY = 80;
    const upd = tables.map((t, i) => ({
      ...t,
      x: snap(startX + (i % cols) * cellW + (maxW - t.w) / 2),
      y: snap(startY + Math.floor(i / cols) * cellH + (maxH - t.h) / 2),
    }));
    const map = new Map(upd.map((e) => [e.id, e]));
    commit({ ...layout, elements: layout.elements.map((e) => map.get(e.id) ?? e) });
    toast.success("Stoly zarovnané do mriežky");
  }

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      const meta = e.ctrlKey || e.metaKey;
      if (!inEditable && meta && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (!inEditable && meta && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (!inEditable && meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(new Set(layout.elements.map((el) => el.id)));
        return;
      }
      if (!inEditable && e.key === "Escape") { setSelectedIds(new Set()); setCtxMenu(null); return; }
      if (selectedIds.size === 0) return;
      if (inEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeIds(selectedIds); return; }
      if (meta && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateIds(selectedIds); return; }
      if (!meta && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        updateMany(selectedIds, (el) => ({ rotation: (el.rotation + 90) % 360 }));
        return;
      }
      // Arrow move
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        updateMany(selectedIds, (el) => el.locked ? {} : ({ x: el.x + dx, y: el.y + dy }));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, readOnly, layout]);

  const canvasRef = useRef<HTMLDivElement>(null);

  async function exportPng() {
    const bgDataUrl = layout.backgroundImage?.path ? (await fetchBackgroundDataUrl(layout.backgroundImage.path)) ?? undefined : undefined;
    await exportLayoutAsPng({ layout, filename: `plan-${reservation.data?.event_name ?? id}`, backgroundDataUrl: bgDataUrl });
  }
  async function exportPdf() {
    toast.info("Otvorí sa dialóg tlače — v ňom vyberte „Uložiť ako PDF“.");
    const bgDataUrl = layout.backgroundImage?.path ? (await fetchBackgroundDataUrl(layout.backgroundImage.path)) ?? undefined : undefined;
    await exportLayoutAsPdf({ layout, filename: `plan-${reservation.data?.event_name ?? id}`, backgroundDataUrl: bgDataUrl });
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
    const def = PALETTE.find((p) => p.type === type);
    const w = def?.defaults.w ?? 100, h = def?.defaults.h ?? 100;
    addEl(type, (e.clientX - rect.left) / scale - w / 2, (e.clientY - rect.top) / scale - h / 2);
  }

  function toggleSelect(elId: string, additive: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (additive) {
        if (next.has(elId)) next.delete(elId); else next.add(elId);
      } else {
        next.clear();
        next.add(elId);
      }
      return next;
    });
  }

  // Marquee lasso
  function startMarquee(e: React.PointerEvent) {
    if (readOnly) return;
    if (e.target !== e.currentTarget) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const scale = rect.width / layout.width;
    const x0 = (e.clientX - rect.left) / scale;
    const y0 = (e.clientY - rect.top) / scale;
    const additive = e.shiftKey;
    if (!additive) setSelectedIds(new Set());
    const initial = additive ? new Set(selectedIds) : new Set<string>();
    const el = document.createElement("div");
    el.style.cssText = `position:absolute;border:1.5px dashed #2563eb;background:rgba(37,99,235,0.08);pointer-events:none;left:${x0}px;top:${y0}px;width:0;height:0;`;
    canvasRef.current!.appendChild(el);
    const onMove = (ev: PointerEvent) => {
      const x1 = (ev.clientX - rect.left) / scale;
      const y1 = (ev.clientY - rect.top) / scale;
      const left = Math.min(x0, x1), top = Math.min(y0, y1);
      const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      el.style.left = left + "px"; el.style.top = top + "px"; el.style.width = w + "px"; el.style.height = h + "px";
      const box = { l: left, t: top, r: left + w, b: top + h };
      const hits = new Set(initial);
      for (const item of layout.elements) {
        const l = item.x, t = item.y, r = item.x + item.w, b = item.y + item.h;
        if (l < box.r && r > box.l && t < box.b && b > box.t) hits.add(item.id);
      }
      setSelectedIds(hits);
    };
    const onUp = () => {
      el.remove();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Legend colors: include used zone_custom
  const legendItems = useMemo(() => {
    const base: Array<[string, string]> = [
      ["Pódium", ZONE_COLORS.zone_podium],
      ["Vstup", ZONE_COLORS.zone_entry],
      ["VIP", ZONE_COLORS.zone_vip],
    ];
    const customs = new Set<string>();
    for (const el of layout.elements) {
      if (el.type === "zone_custom" && el.color) customs.add(`${el.color}::${el.label ?? "Vlastná"}`);
    }
    for (const c of customs) {
      const [color, label] = c.split("::");
      base.push([label, color]);
    }
    return base;
  }, [layout.elements]);

  return (
    <>
      <AppHeader title={`Plán: ${reservation.data?.event_name ?? "…"}`} />
      <div className="p-4 md:p-6 space-y-4 print:p-0">
        {!readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/reservations/$id" params={{ id }}><ArrowLeft className="size-4 mr-1" />Späť</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo}><Undo2 className="size-4 mr-1" />Späť</Button>
              <Button variant="outline" size="sm" onClick={redo} disabled={!canRedo}><Redo2 className="size-4 mr-1" />Znovu</Button>
              <span className="mx-1 h-5 w-px bg-border" />
              <Button variant="outline" size="sm" onClick={zoomOut}><ZoomOut className="size-4" /></Button>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="sm" onClick={zoomIn}><ZoomIn className="size-4" /></Button>
              <Button variant="outline" size="sm" onClick={zoomFit}><Maximize2 className="size-4 mr-1" />Fit</Button>
              <Button variant="ghost" size="sm" onClick={zoomReset}>100%</Button>
              <span className="mx-1 h-5 w-px bg-border" />
              <Button variant="outline" size="sm" onClick={renumberTables}><Hash className="size-4 mr-1" />Prečíslovať stoly</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}>
                <BookOpen className="size-4 mr-1" />Šablóny
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setNewTemplateName(reservation.data?.event_name ?? ""); setSaveTemplateOpen(true); }}>
                <BookmarkPlus className="size-4 mr-1" />Uložiť ako šablónu
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
            <span className="text-xs text-muted-foreground mr-2 px-1">
              Zarovnať ({selectedIds.size} vybraných):
            </span>
            <Button variant="ghost" size="sm" onClick={() => alignSelected("left")} title="Zarovnať vľavo"><AlignStartVertical className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => alignSelected("hcenter")} title="Centrovať horizontálne"><AlignHorizontalJustifyCenter className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => alignSelected("right")} title="Zarovnať vpravo"><AlignStartVertical className="size-4 rotate-180" /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={() => alignSelected("top")} title="Zarovnať hore"><AlignStartHorizontal className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => alignSelected("vcenter")} title="Centrovať vertikálne"><AlignVerticalJustifyCenter className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => alignSelected("bottom")} title="Zarovnať dole"><AlignStartHorizontal className="size-4 rotate-180" /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={() => alignSelected("distH")} title="Rovnomerne horizontálne">↔ rozložiť</Button>
            <Button variant="ghost" size="sm" onClick={() => alignSelected("distV")} title="Rovnomerne vertikálne">↕ rozložiť</Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="outline" size="sm" onClick={arrangeTablesGrid} title="Usporiadať stoly do mriežky"><LayoutGrid className="size-4 mr-1" />Mriežka stolov</Button>
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
            <div className="space-y-4 print:hidden">
            <Card className="print:hidden">
              <CardContent className="p-3 space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Paleta</div>
                {PALETTE.map((p) => (
                  <div
                    key={p.type}
                    draggable
                    onDragStart={(e) => onPaletteDragStart(e, p.type)}
                    onClick={() => addAtViewportCenter(p.type)}
                    onDoubleClick={() => addAtViewportCenter(p.type)}
                    className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/60 active:bg-muted select-none touch-manipulation"
                    title="Klepnite pre pridanie na plátno (alebo pretiahnite)"
                  >
                    <p.icon className="size-4 shrink-0" />
                    <span className="text-xs">{p.label}</span>
                    <Plus className="size-3 ml-auto text-muted-foreground" />
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground pt-1">
                  Klepnite/pretiahnite. Shift+klik = pridať do výberu. Ťahaním po prázdnej ploche = laso.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Ruler className="size-3" />Miestnosť
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Šírka (m)</Label>
                    <Input type="number" step="0.5" min={0}
                      value={layout.roomWidthM ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? undefined : Math.max(0, Number(e.target.value));
                        commit({ ...layout, roomWidthM: v });
                      }} />
                  </div>
                  <div>
                    <Label className="text-[10px]">Dĺžka (m)</Label>
                    <Input type="number" step="0.5" min={0}
                      value={layout.roomHeightM ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? undefined : Math.max(0, Number(e.target.value));
                        commit({ ...layout, roomHeightM: v });
                      }} />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">Škála (px/m): {layout.pxPerMeter ?? Math.round((layout.roomWidthM ? layout.width / layout.roomWidthM : 0))}</Label>
                  <Input type="number" step="1" min={0}
                    value={layout.pxPerMeter ?? ""}
                    placeholder="auto"
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Math.max(0, Number(e.target.value));
                      commit({ ...layout, pxPerMeter: v });
                    }} />
                </div>
                <div className="rounded-md bg-muted/40 p-2 text-xs">
                  <div className="font-medium mb-0.5">Miesta na sedenie</div>
                  <div className="tabular-nums">
                    <span className="text-lg font-semibold">{capacity.chairs}</span> stoličiek · {capacity.tables} stolov
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <ImageIcon className="size-3" />Podklad / pôdorys
                </div>
                {layout.backgroundImage?.path ? (
                  <div className="space-y-2">
                    {bgUrl && (<img src={bgUrl} alt="Podklad" className="w-full h-24 object-cover rounded border" />)}
                    <div>
                      <Label className="text-[10px]">Priehľadnosť: {Math.round((layout.backgroundImage.opacity ?? 0.5) * 100)}%</Label>
                      <input type="range" min={0.05} max={1} step={0.05}
                        value={layout.backgroundImage.opacity ?? 0.5}
                        onChange={(e) => commit({ ...layout, backgroundImage: { ...layout.backgroundImage!, opacity: Number(e.target.value) } })}
                        className="w-full" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs">
                        <Input type="file" accept="image/*" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadBackground(f); e.target.value = ""; }} />
                        <span className="flex items-center justify-center gap-1 h-8 rounded border cursor-pointer hover:bg-muted/60">
                          <ImageIcon className="size-3" />Vymeniť
                        </span>
                      </label>
                      <Button variant="destructive" size="sm" onClick={removeBackground}>
                        <X className="size-3 mr-1" />Odstrániť
                      </Button>
                    </div>
                  </div>
                ) : (
                  <label className="block text-xs">
                    <Input type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadBackground(f); e.target.value = ""; }} />
                    <span className="flex items-center justify-center gap-1 h-9 rounded border cursor-pointer hover:bg-muted/60">
                      <ImageIcon className="size-3" />Nahrať pôdorys
                    </span>
                  </label>
                )}
              </CardContent>
            </Card>
            </div>
          )}

          <CanvasViewport
            viewportRef={viewportRef}
            zoom={zoom}
            setZoom={setZoom}
            layout={layout}
            readOnly={readOnly}
            onDrop={onCanvasDrop}
            onBackgroundPointerDown={(e) => { setCtxMenu(null); startMarquee(e); }}
            canvasRef={canvasRef}
            bgUrl={bgUrl}
            bgOpacity={layout.backgroundImage?.opacity ?? 0.5}
          >
            {sortByZ(layout.elements).map((el) => (
              <ElementNode
                key={el.id}
                el={el}
                zoom={zoom}
                selected={!readOnly && selectedIds.has(el.id)}
                readOnly={readOnly}
                onSelect={(additive) => toggleSelect(el.id, additive)}
                onChange={(patch) => updateEl(el.id, patch)}
                onDragMany={(dx, dy) => {
                  if (selectedIds.size > 1 && selectedIds.has(el.id)) {
                    updateMany(selectedIds, (e2) => e2.locked ? {} : ({ x: e2.x + dx, y: e2.y + dy }));
                  }
                }}
                selectedCount={selectedIds.size}
                allSelected={selectedIds}
                onContextMenu={(x, y) => setCtxMenu({ x, y, elId: el.id })}
              />
            ))}
          </CanvasViewport>

          {!readOnly && (
            <Card className="print:hidden">
              <CardContent className="p-3 space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Vlastnosti</div>
                {!selected && selectedIds.size === 0 && <p className="text-xs text-muted-foreground">Označte prvok na plátne.</p>}
                {!selected && selectedIds.size > 1 && (
                  <p className="text-xs text-muted-foreground">Vybraných: <b>{selectedIds.size}</b> prvkov. Presúvajte ťahaním, mažte klávesou Delete.</p>
                )}
                {selected && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{selected.type}</span>
                      <Button
                        size="icon" variant="ghost" className="size-6"
                        onClick={() => toggleLock(selected.id)}
                        title={selected.locked ? "Odomknúť" : "Zamknúť"}>
                        {selected.locked ? <Lock className="size-3 text-amber-600" /> : <Unlock className="size-3" />}
                      </Button>
                    </div>
                    <div>
                      <Label className="text-xs">Popis / číslo</Label>
                      <Input value={selected.label ?? ""} onChange={(e) => updateEl(selected.id, { label: e.target.value })} placeholder="napr. Stôl 5" disabled={selected.locked} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Šírka</Label>
                        <Input type="number" value={selected.w} disabled={!isResizable(selected.type) || selected.locked}
                          onChange={(e) => updateEl(selected.id, { w: Math.max(20, Number(e.target.value)) })} />
                      </div>
                      <div>
                        <Label className="text-xs">Výška</Label>
                        <Input type="number" value={selected.h} disabled={!isResizable(selected.type) || selected.locked}
                          onChange={(e) => updateEl(selected.id, { h: Math.max(20, Number(e.target.value)) })} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs flex items-center gap-1"><RotateCw className="size-3" />Otočenie: {selected.rotation}°</Label>
                      <input type="range" min={0} max={360} step={5} value={selected.rotation}
                        disabled={selected.locked}
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
                    {selected.type === "chair" && (
                      <div>
                        <Label className="text-xs">Typ stoličky</Label>
                        <select
                          className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                          value={selected.chairVariant ?? "standard"}
                          disabled={selected.locked}
                          onChange={(e) => updateEl(selected.id, { chairVariant: e.target.value as ChairVariant })}
                        >
                          {(Object.entries(CHAIR_VARIANT_STYLE) as [ChairVariant, typeof CHAIR_VARIANT_STYLE.standard][]).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {(isTable(selected.type) || isZone(selected.type)) && (
                      <div>
                        <Label className="text-xs">{isZone(selected.type) ? "Farba zóny" : "Farba stola"}</Label>
                        <div className="flex items-center gap-2">
                          <input type="color"
                            value={selected.color ?? (isZone(selected.type) ? "#0ea5e9" : TABLE_DEFAULT_FILL)}
                            disabled={selected.locked}
                            onChange={(e) => updateEl(selected.id, { color: e.target.value })}
                            className="w-16 h-8 rounded border" />
                          {isTable(selected.type) && selected.color && (
                            <Button size="sm" variant="ghost" onClick={() => updateEl(selected.id, { color: undefined })}>Reset</Button>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => bringToFront(selected.id)}><ArrowUpToLine className="size-4 mr-1" />Dopredu</Button>
                      <Button variant="outline" size="sm" onClick={() => sendToBack(selected.id)}><ArrowDownToLine className="size-4 mr-1" />Dozadu</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => duplicateIds(new Set([selected.id]))}>
                        <Copy className="size-4 mr-1" />Kopírovať
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => removeIds(new Set([selected.id]))} disabled={selected.locked}>
                        <Trash2 className="size-4 mr-1" />Vymazať
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Skratky: šípky = 1 px (Shift = 10), R = rotácia 90°, Esc = zrušiť výber, Ctrl/Cmd+A = všetko, Ctrl/Cmd+D = kópia.
                    </p>
                  </div>
                )}

                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Legenda</div>
                  {legendItems.map(([name, color]) => (
                    <div key={`${name}-${color}`} className="flex items-center gap-2 text-xs">
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

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: "Kopírovať", icon: <Copy className="size-3.5" />, onClick: () => duplicateIds(new Set([ctxMenu.elId])) },
            { label: "Poslať dopredu", icon: <ArrowUpToLine className="size-3.5" />, onClick: () => bringToFront(ctxMenu.elId) },
            { label: "Poslať dozadu", icon: <ArrowDownToLine className="size-3.5" />, onClick: () => sendToBack(ctxMenu.elId) },
            {
              label: layout.elements.find((e) => e.id === ctxMenu.elId)?.locked ? "Odomknúť" : "Zamknúť",
              icon: layout.elements.find((e) => e.id === ctxMenu.elId)?.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />,
              onClick: () => toggleLock(ctxMenu.elId),
            },
            { label: "Zmazať", icon: <Trash2 className="size-3.5" />, danger: true, onClick: () => removeIds(new Set([ctxMenu.elId])) },
          ]}
        />
      )}

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Šablóny rozložení</DialogTitle>
            <DialogDescription>Načítať existujúcu šablónu do tejto rezervácie.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto divide-y">
            {templates.isLoading && <p className="text-sm text-muted-foreground p-2">Načítavam…</p>}
            {!templates.isLoading && (templates.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground p-2">Žiadne šablóny zatiaľ nie sú uložené.</p>
            )}
            {templates.data?.map((t: any) => {
              const isRenaming = renamingId === t.id;
              return (
                <div key={t.id} className="flex items-center gap-2 py-2">
                  {isRenaming ? (
                    <>
                      <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="h-8" />
                      <Button size="sm" onClick={() => renameTemplate.mutate({ tid: t.id, name: renameValue })} disabled={renameTemplate.isPending}>OK</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>Zrušiť</Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(t.created_at).toLocaleString("sk-SK")}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => loadTemplateInto(t.id)}>Načítať</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRenamingId(t.id); setRenameValue(t.name); }}>Premenovať</Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (window.confirm(`Zmazať šablónu „${t.name}“?`)) deleteTemplate.mutate(t.id); }}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTemplatesOpen(false)}>Zavrieť</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Uložiť ako šablónu</DialogTitle>
            <DialogDescription>Súčasné rozloženie sa uloží ako opakovane použiteľná šablóna.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Názov šablóny</Label>
            <Input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="napr. Svadba 80 hostí" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveTemplateOpen(false)}>Zrušiť</Button>
            <Button onClick={() => saveAsTemplate.mutate(newTemplateName)} disabled={saveAsTemplate.isPending || !newTemplateName.trim()}>
              {saveAsTemplate.isPending ? "Ukladám…" : "Uložiť"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------- Context menu ----------------
function ContextMenu({ x, y, onClose, items }: {
  x: number; y: number; onClose: () => void;
  items: Array<{ label: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void }>;
}) {
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-ctx-menu]")) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div
      data-ctx-menu
      className="fixed z-50 min-w-[180px] rounded-md border bg-popover text-popover-foreground shadow-md p-1"
      style={{ left: x, top: y }}
    >
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted ${it.danger ? "text-destructive" : ""}`}
          onClick={() => { it.onClick(); onClose(); }}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- Canvas viewport ----------------
function CanvasViewport({
  viewportRef, canvasRef, zoom, setZoom, layout, readOnly, onDrop, onBackgroundPointerDown, children, bgUrl, bgOpacity,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  layout: LayoutData;
  readOnly: boolean;
  onDrop: (e: React.DragEvent) => void;
  onBackgroundPointerDown: (e: React.PointerEvent) => void;
  children: React.ReactNode;
  bgUrl?: string | null;
  bgOpacity?: number;
}) {
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 / 1.1 : 1.1;
      setZoom((z) => Math.max(0.25, Math.min(2, Math.round(z * delta * 100) / 100)));
    }
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [viewportRef, setZoom]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    let startDist = 0;
    let startZoom = 1;
    function dist(t: TouchList) { const [a, b] = [t[0], t[1]]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    function onStart(e: TouchEvent) { if (e.touches.length !== 2) return; startDist = dist(e.touches); setZoom((z) => { startZoom = z; return z; }); }
    function onMove(e: TouchEvent) { if (e.touches.length !== 2 || startDist === 0) return; e.preventDefault(); const d = dist(e.touches); const ratio = d / startDist; setZoom(() => Math.max(0.25, Math.min(2, Math.round(startZoom * ratio * 100) / 100))); }
    function onEnd() { startDist = 0; }
    vp.addEventListener("touchstart", onStart, { passive: true });
    vp.addEventListener("touchmove", onMove, { passive: false });
    vp.addEventListener("touchend", onEnd);
    vp.addEventListener("touchcancel", onEnd);
    return () => {
      vp.removeEventListener("touchstart", onStart);
      vp.removeEventListener("touchmove", onMove);
      vp.removeEventListener("touchend", onEnd);
      vp.removeEventListener("touchcancel", onEnd);
    };
  }, [viewportRef, setZoom]);

  const scaledW = layout.width * zoom;
  const scaledH = layout.height * zoom;

  return (
    <div
      ref={viewportRef}
      className="overflow-auto rounded-lg border bg-white"
      style={{ maxHeight: "calc(100vh - 220px)", minHeight: 320, touchAction: "pan-x pan-y" }}
    >
      <div style={{ width: scaledW, height: scaledH, position: "relative" }}>
        <div
          ref={canvasRef}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onBackgroundPointerDown(e); }}
          onContextMenu={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
          className="relative bg-white"
          style={{
            width: layout.width, height: layout.height,
            transform: `scale(${zoom})`, transformOrigin: "0 0",
            backgroundImage: `linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)`,
            backgroundSize: `${GRID}px ${GRID}px`,
          }}
        >
          {bgUrl && (
            <img
              src={bgUrl}
              alt=""
              draggable={false}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", opacity: bgOpacity ?? 0.5, pointerEvents: "none",
                userSelect: "none",
              }}
            />
          )}
          {layout.roomWidthM && layout.roomHeightM && (
            <div
              className="absolute pointer-events-none border-2 border-dashed border-slate-500/60 rounded"
              style={{ left: 0, top: 0, width: layout.width, height: layout.height }}
            >
              <div className="absolute -top-6 left-0 text-[11px] font-medium text-slate-600 bg-white/80 px-1 rounded">
                {layout.roomWidthM} × {layout.roomHeightM} m
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------- Element rendering + drag ----------------
function ElementNode({
  el, zoom, selected, readOnly, onSelect, onChange, onDragMany, selectedCount, allSelected, onContextMenu,
}: {
  el: LayoutElement; zoom: number; selected: boolean; readOnly: boolean;
  onSelect: (additive: boolean) => void;
  onChange: (patch: Partial<LayoutElement>) => void;
  onDragMany: (dx: number, dy: number) => void;
  selectedCount: number;
  allSelected: Set<string>;
  onContextMenu: (x: number, y: number) => void;
}) {
  const [drag, setDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const lastAppliedRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const longPressTimer = useRef<any>(null);

  function startDrag(e: React.PointerEvent, mode: "move" | "resize") {
    if (readOnly) return;
    if (el.locked && mode === "move") { onSelect(e.shiftKey); return; }
    if (el.locked && mode === "resize") return;
    e.stopPropagation();
    const additive = e.shiftKey;
    // If not additive and this element isn't already selected, replace selection
    if (!additive && !selected) onSelect(false);
    else if (additive) onSelect(true);
    const startX = e.clientX, startY = e.clientY;
    const zoomFactor = zoom || 1;
    const orig = { x: el.x, y: el.y, w: el.w, h: el.h };
    const rotated = (((el.rotation % 360) + 360) % 360) !== 0;
    const rad = (el.rotation * Math.PI) / 180;
    const cos = Math.cos(-rad), sin = Math.sin(-rad);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    lastAppliedRef.current = { dx: 0, dy: 0 };
    const multi = mode === "move" && selectedCount > 1 && allSelected.has(el.id);
    function onMove(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / zoomFactor;
      const dy = (ev.clientY - startY) / zoomFactor;
      let next: { x: number; y: number; w: number; h: number };
      if (mode === "move") {
        const nx = rotated ? orig.x + dx : snap(orig.x + dx);
        const ny = rotated ? orig.y + dy : snap(orig.y + dy);
        next = { x: nx, y: ny, w: orig.w, h: orig.h };
        if (multi) {
          const totalDx = nx - orig.x;
          const totalDy = ny - orig.y;
          const incDx = totalDx - lastAppliedRef.current.dx;
          const incDy = totalDy - lastAppliedRef.current.dy;
          if (incDx !== 0 || incDy !== 0) {
            onDragMany(incDx, incDy);
            lastAppliedRef.current = { dx: totalDx, dy: totalDy };
          }
          dragRef.current = null;
          return;
        }
      } else {
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
    zIndex: 1 + (el.z ?? 0),
  };

  function handleContextMenu(e: React.MouseEvent) {
    if (readOnly) return;
    e.preventDefault(); e.stopPropagation();
    if (!selected) onSelect(false);
    onContextMenu(e.clientX, e.clientY);
  }
  function handlePointerDownWithLongPress(e: React.PointerEvent) {
    if (e.pointerType === "touch") {
      const cx = e.clientX, cy = e.clientY;
      longPressTimer.current = setTimeout(() => {
        onSelect(false);
        onContextMenu(cx, cy);
      }, 550);
    }
    startDrag(e, "move");
  }
  function clearLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  return (
    <div
      style={baseStyle}
      onPointerDown={handlePointerDownWithLongPress}
      onPointerMove={clearLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onContextMenu={handleContextMenu}
      className={`${selected ? "outline outline-2 outline-primary" : ""} ${el.locked ? "opacity-95" : ""} ${readOnly ? "" : "cursor-move"}`}
    >
      <ElementVisual el={displayEl} />
      {el.locked && (
        <div className="absolute -top-2 -left-2 rounded-full bg-amber-500 text-white p-0.5 shadow" title="Zamknuté">
          <Lock className="size-3" />
        </div>
      )}
      {selected && isResizable(el.type) && !el.locked && (
        <div
          onPointerDown={(e) => startDrag(e, "resize")}
          className="absolute flex items-center justify-center cursor-se-resize"
          style={{ right: -12, bottom: -12, width: 24, height: 24, touchAction: "none" }}
          aria-label="Zmeniť veľkosť"
        >
          <div className="size-3 bg-primary rounded-sm shadow" />
        </div>
      )}
    </div>
  );
}

function ElementVisual({ el }: { el: LayoutElement }) {
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#1f2937" };

  if (el.type === "chair") {
    const v = CHAIR_VARIANT_STYLE[el.chairVariant ?? "standard"];
    return (
      <div
        className="w-full h-full rounded-md grid place-items-center relative"
        style={{ ...labelStyle, background: v.fill, border: `1px solid ${v.stroke}` }}
      >
        {v.badge && (
          <span
            className="absolute top-0.5 right-1 text-[9px] font-extrabold"
            style={{ color: v.stroke }}
          >{v.badge}</span>
        )}
        {el.label}
      </div>
    );
  }
  const tableFill = el.color ?? TABLE_DEFAULT_FILL;
  const tableStroke = el.color ? shadeColor(el.color, -30) : TABLE_DEFAULT_STROKE;
  if (el.type === "rect_table") {
    return (
      <div
        className="w-full h-full rounded-md grid place-items-center"
        style={{ ...labelStyle, background: tableFill, border: `2px solid ${tableStroke}` }}
      >
        {el.label || "Stôl"}
      </div>
    );
  }
  if (el.type === "round_table") {
    return (
      <div
        className="w-full h-full rounded-full grid place-items-center"
        style={{ ...labelStyle, background: tableFill, border: `2px solid ${tableStroke}` }}
      >
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
          className="absolute rounded-full grid place-items-center"
          style={{
            left: (el.w - tableSize) / 2, top: (el.h - tableSize) / 2,
            width: tableSize, height: tableSize,
            background: tableFill, border: `2px solid ${tableStroke}`,
            ...labelStyle,
          }}
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
  const color = el.color ?? ZONE_COLORS[el.type] ?? "#0ea5e9";
  return (
    <div
      className="w-full h-full rounded-lg grid place-items-center font-semibold text-sm"
      style={{ backgroundColor: `${color}33`, border: `2px dashed ${color}`, color }}
    >
      {el.label || "Zóna"}
    </div>
  );
}