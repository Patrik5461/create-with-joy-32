import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, AlignStartVertical, AlignStartHorizontal,
  LayoutGrid, Theater, Copy, ClipboardPaste, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2,
  Image as ImageIcon, BookOpen, BookmarkPlus, X, Ruler, Lock, Unlock, ArrowUpToLine,
  ArrowDownToLine, Hash, Keyboard, Type, Wine, Disc3, UtensilsCrossed, Minus as MinusIcon,
  Package, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  CHAIR_VARIANT_STYLE, DEFAULT_PX_PER_METER, GRID, SCHEMA_VERSION, TYPE_DEFAULTS, TYPE_LABEL,
  ZONE_COLORS, alignElements, arrangeGrid, canRedo, canUndo, computeCapacity, computePlacement,
  computeSnap, defaultSizePx, elementFill, elementLabel, emptyLayout, formatMeters,
  furnitureElementSize, historyPush, historyRedo, historySeed, historyUndo, isTable, isZone,
  LayoutDataSchema, mToPx, nextMaxZ, nextMinZ, parseLayout, pxToM, renumberTables, resizeRoom,
  resolvePxPerMeter, seatsOf, snap, sortByZ,
  type AlignMode, type ChairVariant, type ElType, type History, type LayoutData, type LayoutElement,
} from "@/lib/layout-plan";
import { exportLayoutPdf, exportLayoutPng, fetchBackgroundDataUrl } from "@/lib/layout-export";

const searchSchema = z.object({ view: z.coerce.boolean().optional() });

export const Route = createFileRoute("/_authenticated/reservations/$id/layout")({
  head: () => ({ meta: [{ title: "Plán rozloženia · Mima Production CRM" }] }),
  validateSearch: searchSchema,
  component: LayoutEditor,
});

function uid() { return Math.random().toString(36).slice(2, 10); }

/** Paleta je rozdelená do skupín, inak by bol jeden dlhý nečitateľný zoznam. */
const PALETTE_GROUPS: { title: string; types: { type: ElType; icon: any }[] }[] = [
  {
    title: "Stoly",
    types: [
      { type: "round_table_chairs", icon: Users },
      { type: "round_table", icon: Circle },
      { type: "rect_table", icon: Square },
    ],
  },
  {
    title: "Sedenie",
    types: [{ type: "chair", icon: Armchair }],
  },
  {
    title: "Plochy",
    types: [
      { type: "stage", icon: Theater },
      { type: "dance_floor", icon: Disc3 },
      { type: "bar", icon: Wine },
      { type: "buffet", icon: UtensilsCrossed },
      { type: "wall", icon: MinusIcon },
      { type: "text", icon: Type },
    ],
  },
  {
    title: "Zóny",
    types: [
      { type: "zone_podium", icon: Music },
      { type: "zone_entry", icon: DoorOpen },
      { type: "zone_vip", icon: Crown },
      { type: "zone_custom", icon: Square },
    ],
  },
];

const SHORTCUTS: [string, string][] = [
  ["Šípky", "posun o 1 px (so Shift o 10)"],
  ["R", "otočiť o 90°"],
  ["Delete", "zmazať výber"],
  ["Ctrl/Cmd + Z", "späť"],
  ["Ctrl/Cmd + Shift + Z", "znovu"],
  ["Ctrl/Cmd + C / V", "kopírovať / vložiť"],
  ["Ctrl/Cmd + D", "duplikovať"],
  ["Ctrl/Cmd + A", "označiť všetko"],
  ["Ctrl/Cmd + S", "uložiť plán"],
  ["Shift + klik", "pridať do výberu"],
  ["Ťah po ploche", "laso (výber viacerých)"],
  ["Ctrl/Cmd + koliesko", "priblíženie"],
  ["Esc", "zrušiť výber"],
];

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
        .select("id, event_name, venue, event_start_at, load_at, layout, reservation_items(qty, furniture_item_id, furniture_items(id, name, dimensions))")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; elId: string } | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [exporting, setExporting] = useState<null | "png" | "pdf">(null);
  const clipboardRef = useRef<LayoutElement[]>([]);

  // ---- história ----------------------------------------------------------
  // Plán je vždy ten krok histórie, na ktorom stojíme — jeden zdroj pravdy,
  // takže Späť/Znovu nemôže rozísť plán a históriu.
  const [history, setHistory] = useState<History>(() => historySeed(emptyLayout()));
  const layout = history.stack[history.idx];
  const pxPerMeter = resolvePxPerMeter(layout);

  const commit = useCallback((next: LayoutData, key?: string) => {
    setHistory((h) => historyPush(h, next, key));
  }, []);
  const undo = useCallback(() => setHistory(historyUndo), []);
  const redo = useCallback(() => setHistory(historyRedo), []);

  // ---- načítanie ---------------------------------------------------------
  useEffect(() => {
    if (!reservation.data || loaded) return;
    const { layout: parsed, invalid } = parseLayout(reservation.data.layout);
    const next = parsed ?? emptyLayout();
    if (invalid) {
      toast.error("Uložený plán má neplatný formát — otvoril sa prázdny plán.", {
        description: "Pôvodné dáta sa neprepíšu, kým plán neuložíš.",
      });
    }
    setHistory(historySeed(next));
    // Neplatný plán nemá s čím porovnávať — každá zmena je vtedy „neuložená“.
    setSavedSnapshot(invalid ? null : JSON.stringify(next));
    setLoaded(true);
  }, [reservation.data, loaded]);

  const currentSnapshot = useMemo(() => JSON.stringify(layout), [layout]);
  const isDirty = loaded && !readOnly && currentSnapshot !== savedSnapshot;

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = ""; }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const save = useMutation({
    mutationFn: async () => {
      const toSave: LayoutData = { ...layout, schemaVersion: SCHEMA_VERSION };
      const { error } = await supabase.from("reservations").update({ layout: toSave as any }).eq("id", id);
      if (error) throw error;
      return toSave;
    },
    onSuccess: (saved) => {
      toast.success("Plán uložený");
      setSavedSnapshot(JSON.stringify(saved));
      qc.invalidateQueries({ queryKey: ["reservation-layout", id] });
      qc.invalidateQueries({ queryKey: ["reservations-for-layouts"] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ---- výber -------------------------------------------------------------
  const primaryId = selectedIds.size === 1 ? Array.from(selectedIds)[0] : null;
  const selected = useMemo(
    () => (primaryId ? layout.elements.find((e) => e.id === primaryId) ?? null : null),
    [layout, primaryId],
  );

  const capacity = useMemo(() => computeCapacity(layout), [layout]);

  // ---- položky z rezervácie ---------------------------------------------
  const reservedItems = useMemo(() => {
    const rows = (reservation.data?.reservation_items ?? []) as any[];
    return rows
      .filter((r) => r.furniture_items)
      .map((r) => ({
        id: r.furniture_items.id as string,
        name: r.furniture_items.name as string,
        dimensions: r.furniture_items.dimensions as string | null,
        qty: Number(r.qty ?? 0),
      }));
  }, [reservation.data]);

  const placement = useMemo(
    () => computePlacement(reservedItems, layout.elements),
    [reservedItems, layout.elements],
  );

  // ---- podklad -----------------------------------------------------------
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
  function removeBackground() {
    const prev = layout.backgroundImage?.path;
    if (prev) supabase.storage.from("layout-backgrounds").remove([prev]).catch(() => {});
    commit({ ...layout, backgroundImage: null });
  }

  // ---- šablóny -----------------------------------------------------------
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
      // Podklad je viazaný na konkrétnu rezerváciu, do šablóny nepatrí.
      const payload: LayoutData = { ...layout, backgroundImage: null, schemaVersion: SCHEMA_VERSION };
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
    const hasContent = layout.elements.length > 0;
    if (hasContent && !window.confirm("Prepísať súčasné rozloženie touto šablónou?")) return;
    commit({
      ...res.data,
      pxPerMeter: resolvePxPerMeter(res.data),
      backgroundImage: layout.backgroundImage ?? null,
      schemaVersion: SCHEMA_VERSION,
    });
    setSelectedIds(new Set());
    setTemplatesOpen(false);
    toast.success(`Šablóna „${tpl.name}“ načítaná`);
  }

  // ---- operácie nad prvkami ---------------------------------------------
  const updateEl = useCallback((elId: string, patch: Partial<LayoutElement>, key?: string) => {
    setHistory((h) => {
      const cur = h.stack[h.idx];
      const next = { ...cur, elements: cur.elements.map((e) => (e.id === elId ? { ...e, ...patch } : e)) };
      return historyPush(h, next, key);
    });
  }, []);

  const updateMany = useCallback((ids: Set<string>, patchFn: (el: LayoutElement) => Partial<LayoutElement>, key?: string) => {
    setHistory((h) => {
      const cur = h.stack[h.idx];
      const next = { ...cur, elements: cur.elements.map((e) => (ids.has(e.id) ? { ...e, ...patchFn(e) } : e)) };
      return historyPush(h, next, key);
    });
  }, []);

  function removeIds(ids: Set<string>) {
    if (ids.size === 0) return;
    const removable = layout.elements.filter((e) => ids.has(e.id) && !e.locked);
    if (removable.length === 0) { toast.info("Vybrané prvky sú zamknuté."); return; }
    commit({ ...layout, elements: layout.elements.filter((e) => !ids.has(e.id) || e.locked) });
    setSelectedIds(new Set());
  }

  function duplicateIds(ids: Set<string>) {
    if (ids.size === 0) return;
    const copies = layout.elements
      .filter((e) => ids.has(e.id))
      .map((el) => ({ ...el, id: uid(), x: snap(el.x + 30), y: snap(el.y + 30), locked: false }));
    if (!copies.length) return;
    commit({ ...layout, elements: [...layout.elements, ...copies] });
    setSelectedIds(new Set(copies.map((c) => c.id)));
  }

  function copySelection() {
    const els = layout.elements.filter((e) => selectedIds.has(e.id));
    if (!els.length) return;
    clipboardRef.current = els.map((e) => ({ ...e }));
    toast.success(`Skopírované: ${els.length} ${els.length === 1 ? "prvok" : "prvkov"}`);
  }

  function pasteClipboard() {
    const src = clipboardRef.current;
    if (!src.length) { toast.info("Schránka je prázdna."); return; }
    const copies = src.map((el) => ({ ...el, id: uid(), x: snap(el.x + 40), y: snap(el.y + 40), locked: false }));
    commit({ ...layout, elements: [...layout.elements, ...copies] });
    setSelectedIds(new Set(copies.map((c) => c.id)));
  }

  function toggleLock(elId: string) {
    updateEl(elId, { locked: !layout.elements.find((e) => e.id === elId)?.locked });
  }
  function bringToFront(elId: string) { updateEl(elId, { z: nextMaxZ(layout.elements) }); }
  function sendToBack(elId: string) { updateEl(elId, { z: nextMinZ(layout.elements) }); }

  function addEl(type: ElType, x: number, y: number, extra: Partial<LayoutElement> = {}) {
    const size = defaultSizePx(type, pxPerMeter);
    const def = TYPE_DEFAULTS[type];
    const el: LayoutElement = {
      id: uid(), type,
      x: snap(Math.max(0, Math.min(x, layout.width - size.w))),
      y: snap(Math.max(0, Math.min(y, layout.height - size.h))),
      w: size.w, h: size.h,
      rotation: 0,
      label: def.label,
      chairCount: def.chairCount,
      chairVariant: type === "chair" ? "standard" : undefined,
      color: isZone(type) ? ZONE_COLORS[type] : undefined,
      z: nextMaxZ(layout.elements),
      ...extra,
    };
    commit({ ...layout, elements: [...layout.elements, el] });
    setSelectedIds(new Set([el.id]));
  }

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  /** Stred aktuálneho výrezu v súradniciach plánu — tam pribúdajú nové prvky. */
  function viewportCenter(w: number, h: number) {
    const vp = viewportRef.current;
    if (!vp) return { x: layout.width / 2 - w / 2, y: layout.height / 2 - h / 2 };
    return {
      x: (vp.scrollLeft + vp.clientWidth / 2) / zoom - w / 2,
      y: (vp.scrollTop + vp.clientHeight / 2) / zoom - h / 2,
    };
  }

  function addAtViewportCenter(type: ElType) {
    const size = defaultSizePx(type, pxPerMeter);
    const c = viewportCenter(size.w, size.h);
    addEl(type, c.x, c.y);
  }

  /** Položku zo skladu položíme v jej skutočnom rozmere a s väzbou na sklad. */
  function addFurniture(item: { id: string; name: string; dimensions?: string | null }, at?: { x: number; y: number }) {
    const size = furnitureElementSize(item, pxPerMeter);
    const c = at ?? viewportCenter(size.w, size.h);
    const el: LayoutElement = {
      id: uid(),
      type: "furniture",
      x: snap(Math.max(0, Math.min(c.x, layout.width - size.w))),
      y: snap(Math.max(0, Math.min(c.y, layout.height - size.h))),
      w: size.w, h: size.h,
      rotation: 0,
      shape: size.shape,
      label: item.name,
      furnitureItemId: item.id,
      z: nextMaxZ(layout.elements),
    };
    commit({ ...layout, elements: [...layout.elements, el] });
    setSelectedIds(new Set([el.id]));
  }

  // ---- zoom --------------------------------------------------------------
  function clampZoom(z: number) { return Math.max(0.2, Math.min(3, Math.round(z * 100) / 100)); }
  const zoomIn = () => setZoom((z) => clampZoom(z * 1.15));
  const zoomOut = () => setZoom((z) => clampZoom(z / 1.15));
  const zoomReset = () => setZoom(1);
  const zoomFit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const z = Math.min(vp.clientWidth / (layout.width + 32), vp.clientHeight / (layout.height + 32));
    setZoom(clampZoom(z));
    requestAnimationFrame(() => { if (vp) { vp.scrollLeft = 0; vp.scrollTop = 0; } });
  }, [layout.width, layout.height]);

  // Po načítaní plán rovno prispôsobíme oknu, nech nezačína orezaný.
  const didFit = useRef(false);
  useEffect(() => {
    if (!loaded || didFit.current) return;
    didFit.current = true;
    requestAnimationFrame(zoomFit);
  }, [loaded, zoomFit]);

  // ---- zarovnanie --------------------------------------------------------
  function doAlign(mode: AlignMode) {
    const targets = layout.elements.filter((e) => selectedIds.has(e.id) && !e.locked);
    const out = alignElements(targets, mode);
    if (!out) {
      toast.info(mode === "distH" || mode === "distV" ? "Označte aspoň 3 prvky." : "Označte aspoň 2 prvky.");
      return;
    }
    const map = new Map(out.map((e) => [e.id, e]));
    commit({ ...layout, elements: layout.elements.map((e) => map.get(e.id) ?? e) });
  }

  function doArrangeGrid() {
    const tables = layout.elements.filter((e) => isTable(e.type) && !e.locked);
    if (!tables.length) { toast.info("Žiadne stoly na zarovnanie."); return; }
    const out = arrangeGrid(tables, layout.width);
    const map = new Map(out.map((e) => [e.id, e]));
    commit({ ...layout, elements: layout.elements.map((e) => map.get(e.id) ?? e) });
    toast.success("Stoly zarovnané do mriežky");
  }

  function doRenumber() {
    const { elements, count } = renumberTables(layout.elements);
    commit({ ...layout, elements });
    toast.success(count ? `Prečíslovaných ${count} stolov` : "Žiadne stoly na prečíslovanie");
  }

  // ---- klávesnica --------------------------------------------------------
  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const inEditable = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable;
      const meta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (meta && key === "s") { e.preventDefault(); if (!save.isPending) save.mutate(); return; }
      if (inEditable) return;

      if (meta && key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (meta && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (meta && key === "a") { e.preventDefault(); setSelectedIds(new Set(layout.elements.map((el) => el.id))); return; }
      if (meta && key === "v") { e.preventDefault(); pasteClipboard(); return; }
      if (e.key === "Escape") { setSelectedIds(new Set()); setCtxMenu(null); return; }
      if (selectedIds.size === 0) return;
      if (meta && key === "c") { e.preventDefault(); copySelection(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeIds(selectedIds); return; }
      if (meta && key === "d") { e.preventDefault(); duplicateIds(selectedIds); return; }
      if (!meta && key === "r") {
        e.preventDefault();
        updateMany(selectedIds, (el) => (el.locked ? {} : { rotation: (el.rotation + 90) % 360 }));
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      if (dx || dy) {
        e.preventDefault();
        // Súvislé ťukanie do šípok je jeden krok histórie, nie dvadsať.
        updateMany(selectedIds, (el) => (el.locked ? {} : { x: el.x + dx, y: el.y + dy }), "nudge");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, readOnly, layout, undo, redo, updateMany, save]);

  // ---- export ------------------------------------------------------------
  const exportFilename = `plan-${(reservation.data?.event_name ?? "rozlozenie").toString().replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}`;

  async function withBackground<T>(fn: (bg?: string) => Promise<T>) {
    const path = layout.backgroundImage?.path;
    const bg = path ? await fetchBackgroundDataUrl(path) : undefined;
    return fn(bg);
  }

  async function doExportPng() {
    setExporting("png");
    try {
      await withBackground((bg) => exportLayoutPng(layout, exportFilename, bg));
      toast.success("PNG stiahnuté");
    } catch (e: any) {
      toast.error(e?.message ?? "Export PNG zlyhal");
    } finally { setExporting(null); }
  }

  async function doExportPdf() {
    setExporting("pdf");
    try {
      const r = reservation.data;
      const when = r?.event_start_at ?? r?.load_at;
      await withBackground((bg) => exportLayoutPdf(layout, exportFilename, {
        title: r?.event_name ?? "Plán rozloženia",
        venue: r?.venue ?? null,
        when: when ? new Date(when).toLocaleString("sk-SK", { dateStyle: "long", timeStyle: "short" }) : null,
      }, bg));
      toast.success("PDF stiahnuté");
    } catch (e: any) {
      toast.error(e?.message ?? "Export PDF zlyhal");
    } finally { setExporting(null); }
  }

  // ---- ťahanie z palety --------------------------------------------------
  function onCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const scale = rect.width / layout.width;
    const px = (e.clientX - rect.left) / scale;
    const py = (e.clientY - rect.top) / scale;
    if (raw.startsWith("furniture:")) {
      const fid = raw.slice("furniture:".length);
      const item = reservedItems.find((i) => i.id === fid);
      if (!item) return;
      const size = furnitureElementSize(item, pxPerMeter);
      addFurniture(item, { x: px - size.w / 2, y: py - size.h / 2 });
      return;
    }
    const type = raw as ElType;
    if (!TYPE_DEFAULTS[type]) return;
    const size = defaultSizePx(type, pxPerMeter);
    addEl(type, px - size.w / 2, py - size.h / 2);
  }

  function toggleSelect(elId: string, additive: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (additive) { if (next.has(elId)) next.delete(elId); else next.add(elId); }
      else { next.clear(); next.add(elId); }
      return next;
    });
  }

  // ---- laso --------------------------------------------------------------
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
    const box = document.createElement("div");
    box.style.cssText = `position:absolute;z-index:9999;border:1.5px dashed #2563eb;background:rgba(37,99,235,0.08);pointer-events:none;left:${x0}px;top:${y0}px;width:0;height:0;`;
    canvasRef.current!.appendChild(box);
    const onMove = (ev: PointerEvent) => {
      const x1 = (ev.clientX - rect.left) / scale;
      const y1 = (ev.clientY - rect.top) / scale;
      const left = Math.min(x0, x1), top = Math.min(y0, y1);
      const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      box.style.left = `${left}px`; box.style.top = `${top}px`;
      box.style.width = `${w}px`; box.style.height = `${h}px`;
      const hits = new Set(initial);
      for (const item of layout.elements) {
        if (item.x < left + w && item.x + item.w > left && item.y < top + h && item.y + item.h > top) hits.add(item.id);
      }
      setSelectedIds(hits);
    };
    const onUp = () => {
      box.remove();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  if (reservation.isLoading) {
    return <><AppHeader title="Plán rozloženia" /><div className="p-6 text-muted-foreground">Načítavam…</div></>;
  }
  if (!reservation.data) {
    return <><AppHeader title="Plán rozloženia" /><div className="p-6">Rezervácia sa nenašla.</div></>;
  }

  const eventName = reservation.data.event_name ?? "Bez názvu";

  return (
    <>
      <AppHeader title={`Plán: ${eventName}`} />
      <div className="p-4 md:p-6 space-y-3 print:p-0">
        {!readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/reservations/$id" params={{ id }}><ArrowLeft className="size-4 mr-1" />Späť</Link>
              </Button>
              <span className="mx-0.5 h-5 w-px bg-border" />
              <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo(history)} title="Späť (Ctrl+Z)"><Undo2 className="size-4" /></Button>
              <Button variant="outline" size="sm" onClick={redo} disabled={!canRedo(history)} title="Znovu (Ctrl+Shift+Z)"><Redo2 className="size-4" /></Button>
              <span className="mx-0.5 h-5 w-px bg-border" />
              <Button variant="outline" size="sm" onClick={zoomOut} title="Oddialiť"><ZoomOut className="size-4" /></Button>
              <span className="text-xs text-muted-foreground tabular-nums w-11 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="sm" onClick={zoomIn} title="Priblížiť"><ZoomIn className="size-4" /></Button>
              <Button variant="outline" size="sm" onClick={zoomFit}><Maximize2 className="size-4 mr-1" />Celý plán</Button>
              <Button variant="ghost" size="sm" onClick={zoomReset}>100%</Button>
              <span className="mx-0.5 h-5 w-px bg-border" />
              <Button variant="outline" size="sm" onClick={doRenumber}><Hash className="size-4 mr-1" />Prečíslovať stoly</Button>
              <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)} title="Klávesové skratky"><Keyboard className="size-4" /></Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}><BookOpen className="size-4 mr-1" />Šablóny</Button>
              <Button variant="outline" size="sm" onClick={() => { setNewTemplateName(eventName); setSaveTemplateOpen(true); }}>
                <BookmarkPlus className="size-4 mr-1" />Uložiť ako šablónu
              </Button>
              <Button variant="outline" size="sm" onClick={doExportPng} disabled={!!exporting}>
                {exporting === "png" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <FileImage className="size-4 mr-1" />}PNG
              </Button>
              <Button variant="outline" size="sm" onClick={doExportPdf} disabled={!!exporting}>
                {exporting === "pdf" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <FileText className="size-4 mr-1" />}PDF
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !isDirty}>
                <Save className="size-4 mr-1" />
                {save.isPending ? "Ukladám…" : isDirty ? "Uložiť plán •" : "Uložené"}
              </Button>
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-2 print:hidden">
            <span className="text-xs text-muted-foreground mr-2 px-1">
              {selectedIds.size === 0 ? "Zarovnanie (označte prvky)" : `Zarovnať ${selectedIds.size} vybraných:`}
            </span>
            <Button variant="ghost" size="sm" onClick={() => doAlign("left")} title="Zarovnať vľavo"><AlignStartVertical className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => doAlign("hcenter")} title="Centrovať vodorovne"><AlignHorizontalJustifyCenter className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => doAlign("right")} title="Zarovnať vpravo"><AlignStartVertical className="size-4 rotate-180" /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={() => doAlign("top")} title="Zarovnať hore"><AlignStartHorizontal className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => doAlign("vcenter")} title="Centrovať zvisle"><AlignVerticalJustifyCenter className="size-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => doAlign("bottom")} title="Zarovnať dole"><AlignStartHorizontal className="size-4 rotate-180" /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={() => doAlign("distH")} title="Rovnomerne vodorovne">↔ rozložiť</Button>
            <Button variant="ghost" size="sm" onClick={() => doAlign("distV")} title="Rovnomerne zvisle">↕ rozložiť</Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="outline" size="sm" onClick={doArrangeGrid}><LayoutGrid className="size-4 mr-1" />Mriežka stolov</Button>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={copySelection} disabled={!selectedIds.size} title="Kopírovať (Ctrl+C)"><Copy className="size-4" /></Button>
              <Button variant="ghost" size="sm" onClick={pasteClipboard} title="Vložiť (Ctrl+V)"><ClipboardPaste className="size-4" /></Button>
            </div>
          </div>
        )}

        {readOnly && (
          <div className="flex items-center justify-between gap-2 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/reservations/$id/layout", params: { id }, search: {} })}>
              <ArrowLeft className="size-4 mr-1" />Späť do editora
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-4 mr-1" />Tlač</Button>
              <Button variant="outline" size="sm" onClick={doExportPng} disabled={!!exporting}><FileImage className="size-4 mr-1" />PNG</Button>
              <Button variant="outline" size="sm" onClick={doExportPdf} disabled={!!exporting}><FileText className="size-4 mr-1" />PDF</Button>
            </div>
          </div>
        )}

        <div className={readOnly ? "" : "grid gap-3 xl:grid-cols-[250px_1fr_280px]"}>
          {!readOnly && (
            <div className="space-y-3 print:hidden">
              {reservedItems.length > 0 && (
                <Card>
                  <CardContent className="p-3 space-y-2">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Package className="size-3" />Z rezervácie
                    </div>
                    <div className="max-h-56 overflow-auto -mx-1 px-1 space-y-1">
                      {placement.map((row) => (
                        <div
                          key={row.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", `furniture:${row.id}`)}
                          onClick={() => addFurniture(row)}
                          className="flex items-center gap-2 p-1.5 rounded border cursor-pointer hover:bg-muted/60 select-none"
                          title={`${row.name}${row.dimensions ? ` · ${row.dimensions}` : ""}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] leading-tight truncate">{row.name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {row.placed}/{row.qty} umiestnených
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                              row.remaining === 0 ? "bg-emerald-100 text-emerald-800"
                                : row.remaining < 0 ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {row.remaining > 0 ? `+${row.remaining}` : row.remaining === 0 ? "OK" : row.remaining}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Kliknutím pridáte kus na plán v jeho skutočnom rozmere.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Prvky</div>
                  {PALETTE_GROUPS.map((g) => (
                    <div key={g.title} className="space-y-1">
                      <div className="text-[10px] text-muted-foreground pt-1">{g.title}</div>
                      {g.types.map(({ type, icon: Icon }) => (
                        <div
                          key={type}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", type)}
                          onClick={() => addAtViewportCenter(type)}
                          className="flex items-center gap-2 p-1.5 rounded-md border cursor-pointer hover:bg-muted/60 active:bg-muted select-none touch-manipulation"
                          title={`${TYPE_LABEL[type]} — ${TYPE_DEFAULTS[type].wM} × ${TYPE_DEFAULTS[type].hM} m`}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="text-[11px] leading-tight">{TYPE_LABEL[type]}</span>
                          <Plus className="size-3 ml-auto text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  ))}
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
                      <Input
                        type="number" step="0.5" min={1}
                        value={layout.roomWidthM ?? ""}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v) || v <= 0) return;
                          commit(resizeRoom(layout, v, layout.roomHeightM ?? v), "room");
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Dĺžka (m)</Label>
                      <Input
                        type="number" step="0.5" min={1}
                        value={layout.roomHeightM ?? ""}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v) || v <= 0) return;
                          commit(resizeRoom(layout, layout.roomWidthM ?? v, v), "room");
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Plátno je pôdorys miestnosti. Mierka {Math.round(pxPerMeter)} px / m.
                  </p>
                  <div className="rounded-md bg-muted/40 p-2 space-y-1">
                    <div className="text-xs font-medium">Kapacita</div>
                    <div className="tabular-nums text-sm">
                      <span className="text-xl font-semibold">{capacity.seats}</span> miest na sedenie
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {capacity.tables} stolov · {capacity.chairs} stoličiek
                    </div>
                    {capacity.roomAreaM2 !== null && (
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        Plocha {capacity.roomAreaM2.toFixed(0)} m² · zabraté{" "}
                        {Math.round((capacity.usedAreaM2 / capacity.roomAreaM2) * 100)} %
                        {capacity.seats > 0 && ` · ${(capacity.roomAreaM2 / capacity.seats).toFixed(1)} m² na hosťa`}
                      </div>
                    )}
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
                      {bgUrl && <img src={bgUrl} alt="Podklad" className="w-full h-24 object-cover rounded border" />}
                      <div>
                        <Label className="text-[10px]">Priehľadnosť: {Math.round((layout.backgroundImage.opacity ?? 0.5) * 100)}%</Label>
                        <input
                          type="range" min={0.05} max={1} step={0.05}
                          value={layout.backgroundImage.opacity ?? 0.5}
                          onChange={(e) => commit(
                            { ...layout, backgroundImage: { ...layout.backgroundImage!, opacity: Number(e.target.value) } },
                            "bg-opacity",
                          )}
                          className="w-full"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs">
                          <Input type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadBackground(f); e.target.value = ""; }} />
                          <span className="flex items-center justify-center gap-1 h-8 rounded border cursor-pointer hover:bg-muted/60">
                            <ImageIcon className="size-3" />Vymeniť
                          </span>
                        </label>
                        <Button variant="destructive" size="sm" onClick={removeBackground}><X className="size-3 mr-1" />Odstrániť</Button>
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
            canvasRef={canvasRef}
            zoom={zoom}
            setZoom={setZoom}
            layout={layout}
            pxPerMeter={pxPerMeter}
            readOnly={readOnly}
            guides={guides}
            onDrop={onCanvasDrop}
            onBackgroundPointerDown={(e) => { setCtxMenu(null); startMarquee(e); }}
            bgUrl={bgUrl}
            bgOpacity={layout.backgroundImage?.opacity ?? 0.5}
          >
            {sortByZ(layout.elements).map((el) => (
              <ElementNode
                key={el.id}
                el={el}
                zoom={zoom}
                pxPerMeter={pxPerMeter}
                room={{ width: layout.width, height: layout.height }}
                others={layout.elements}
                selected={!readOnly && selectedIds.has(el.id)}
                readOnly={readOnly}
                onSelect={(additive) => toggleSelect(el.id, additive)}
                onChange={(patch, key) => updateEl(el.id, patch, key)}
                onDragMany={(dx, dy) => {
                  if (selectedIds.size > 1 && selectedIds.has(el.id)) {
                    updateMany(selectedIds, (e2) => (e2.locked ? {} : { x: e2.x + dx, y: e2.y + dy }), `drag:${el.id}`);
                  }
                }}
                onGuides={setGuides}
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

                {selectedIds.size === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Označte prvok na pláne. Ťahaním po prázdnej ploche vyberiete viac prvkov naraz.
                  </p>
                )}

                {selectedIds.size > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Vybraných: <b>{selectedIds.size}</b> prvkov.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => updateMany(selectedIds, (el) => ({ rotation: (el.rotation + 90) % 360 }))}>
                        <RotateCw className="size-4 mr-1" />Otočiť
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => duplicateIds(selectedIds)}>
                        <Copy className="size-4 mr-1" />Kopírovať
                      </Button>
                    </div>
                    <Button variant="destructive" size="sm" className="w-full" onClick={() => removeIds(selectedIds)}>
                      <Trash2 className="size-4 mr-1" />Zmazať výber
                    </Button>
                  </div>
                )}

                {selected && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{TYPE_LABEL[selected.type]}</span>
                      <Button size="icon" variant="ghost" className="size-6" onClick={() => toggleLock(selected.id)}
                        title={selected.locked ? "Odomknúť" : "Zamknúť"}>
                        {selected.locked ? <Lock className="size-3 text-amber-600" /> : <Unlock className="size-3" />}
                      </Button>
                    </div>

                    <div>
                      <Label className="text-xs">Popis / číslo</Label>
                      <Input
                        value={selected.label ?? ""}
                        onChange={(e) => updateEl(selected.id, { label: e.target.value }, `label:${selected.id}`)}
                        placeholder="napr. Stôl 5" disabled={selected.locked}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Šírka (m)</Label>
                        <Input
                          type="number" step="0.1" min={0.1}
                          value={Number(pxToM(selected.w, pxPerMeter).toFixed(2))}
                          disabled={selected.locked}
                          onChange={(e) => {
                            const m = Number(e.target.value);
                            if (!Number.isFinite(m) || m <= 0) return;
                            updateEl(selected.id, { w: Math.max(8, Math.round(mToPx(m, pxPerMeter))) }, `size:${selected.id}`);
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Hĺbka (m)</Label>
                        <Input
                          type="number" step="0.1" min={0.1}
                          value={Number(pxToM(selected.h, pxPerMeter).toFixed(2))}
                          disabled={selected.locked}
                          onChange={(e) => {
                            const m = Number(e.target.value);
                            if (!Number.isFinite(m) || m <= 0) return;
                            updateEl(selected.id, { h: Math.max(8, Math.round(mToPx(m, pxPerMeter))) }, `size:${selected.id}`);
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs flex items-center gap-1"><RotateCw className="size-3" />Otočenie: {selected.rotation}°</Label>
                      <input
                        type="range" min={0} max={355} step={5} value={selected.rotation}
                        disabled={selected.locked}
                        onChange={(e) => updateEl(selected.id, { rotation: Number(e.target.value) }, `rot:${selected.id}`)}
                        className="w-full"
                      />
                    </div>

                    {selected.type === "round_table_chairs" && (
                      <div>
                        <Label className="text-xs">Stoličiek okolo stola</Label>
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="outline" className="size-7"
                            onClick={() => updateEl(selected.id, { chairCount: Math.max(2, (selected.chairCount ?? 8) - 1) })}>
                            <Minus className="size-3" />
                          </Button>
                          <span className="text-sm tabular-nums w-6 text-center">{selected.chairCount ?? 8}</span>
                          <Button size="icon" variant="outline" className="size-7"
                            onClick={() => updateEl(selected.id, { chairCount: Math.min(24, (selected.chairCount ?? 8) + 1) })}>
                            <Plus className="size-3" />
                          </Button>
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
                          {(Object.entries(CHAIR_VARIANT_STYLE) as [ChairVariant, { label: string }][]).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {(isTable(selected.type) || selected.type === "furniture") && (
                      <div>
                        <Label className="text-xs">Miest na sedenie</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number" min={0} className="h-8"
                            value={selected.seats ?? seatsOf(selected, pxPerMeter)}
                            disabled={selected.locked}
                            onChange={(e) => updateEl(selected.id, { seats: Math.max(0, Number(e.target.value) || 0) }, `seats:${selected.id}`)}
                          />
                          {selected.seats !== undefined && (
                            <Button size="sm" variant="ghost" onClick={() => updateEl(selected.id, { seats: undefined })} title="Späť na odhad podľa rozmeru">
                              Auto
                            </Button>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Bez zadania sa odhaduje z rozmeru (60 cm na hosťa).
                        </p>
                      </div>
                    )}

                    {(isTable(selected.type) || isZone(selected.type) || selected.type === "furniture" ||
                      selected.type === "bar" || selected.type === "dance_floor" || selected.type === "buffet" || selected.type === "wall") && (
                      <div>
                        <Label className="text-xs">Farba</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={selected.color ?? elementFill(selected).fill.slice(0, 7)}
                            disabled={selected.locked}
                            onChange={(e) => updateEl(selected.id, { color: e.target.value }, `color:${selected.id}`)}
                            className="w-16 h-8 rounded border"
                          />
                          {selected.color && (
                            <Button size="sm" variant="ghost" onClick={() => updateEl(selected.id, { color: undefined })}>Reset</Button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      Pozícia {formatMeters(selected.x, pxPerMeter)} / {formatMeters(selected.y, pxPerMeter)}
                      {" · "}rozmer {formatMeters(selected.w, pxPerMeter)} × {formatMeters(selected.h, pxPerMeter)}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => bringToFront(selected.id)}><ArrowUpToLine className="size-4 mr-1" />Dopredu</Button>
                      <Button variant="outline" size="sm" onClick={() => sendToBack(selected.id)}><ArrowDownToLine className="size-4 mr-1" />Dozadu</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => duplicateIds(new Set([selected.id]))}><Copy className="size-4 mr-1" />Kopírovať</Button>
                      <Button variant="destructive" size="sm" onClick={() => removeIds(new Set([selected.id]))} disabled={selected.locked}>
                        <Trash2 className="size-4 mr-1" />Vymazať
                      </Button>
                    </div>
                  </div>
                )}

                <div className="border-t pt-3 space-y-1.5">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Legenda</div>
                  <LegendList layout={layout} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: "Kopírovať", icon: <Copy className="size-3.5" />, onClick: () => duplicateIds(new Set([ctxMenu.elId])) },
            { label: "Dopredu", icon: <ArrowUpToLine className="size-3.5" />, onClick: () => bringToFront(ctxMenu.elId) },
            { label: "Dozadu", icon: <ArrowDownToLine className="size-3.5" />, onClick: () => sendToBack(ctxMenu.elId) },
            {
              label: layout.elements.find((e) => e.id === ctxMenu.elId)?.locked ? "Odomknúť" : "Zamknúť",
              icon: layout.elements.find((e) => e.id === ctxMenu.elId)?.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />,
              onClick: () => toggleLock(ctxMenu.elId),
            },
            { label: "Zmazať", icon: <Trash2 className="size-3.5" />, danger: true, onClick: () => removeIds(new Set([ctxMenu.elId])) },
          ]}
        />
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Klávesové skratky</DialogTitle>
            <DialogDescription>Platia, keď nepíšete do políčka.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 text-sm">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-3">
                <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[11px] font-mono">{k}</kbd>
                <span className="text-muted-foreground text-xs">{v}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
            {templates.data?.map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 py-2">
                {renamingId === t.id ? (
                  <>
                    <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="h-8" />
                    <Button size="sm" onClick={() => renameTemplate.mutate({ tid: t.id, name: renameValue })} disabled={renameTemplate.isPending}>OK</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>Zrušiť</Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString("sk-SK")}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => loadTemplateInto(t.id)}>Načítať</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRenamingId(t.id); setRenameValue(t.name); }}>Premenovať</Button>
                    <Button size="icon" variant="ghost" onClick={() => { if (window.confirm(`Zmazať šablónu „${t.name}“?`)) deleteTemplate.mutate(t.id); }}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            ))}
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
            <DialogDescription>Rozloženie sa uloží na opakované použitie. Podklad sa neukladá.</DialogDescription>
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

/** Legenda vypisuje len to, čo je na pláne naozaj použité. */
function LegendList({ layout }: { layout: LayoutData }) {
  const items = useMemo(() => {
    const seen = new Map<string, { label: string; color: string }>();
    for (const el of layout.elements) {
      if (el.type === "text") continue;
      const { fill, stroke } = elementFill(el);
      const label = isZone(el.type) || el.type === "furniture" ? elementLabel(el) || TYPE_LABEL[el.type] : TYPE_LABEL[el.type];
      const key = `${label}::${fill}`;
      if (!seen.has(key)) seen.set(key, { label, color: isZone(el.type) ? stroke : fill });
    }
    return [...seen.values()].slice(0, 12);
  }, [layout.elements]);

  if (!items.length) return <p className="text-xs text-muted-foreground">Plán je zatiaľ prázdny.</p>;
  return (
    <>
      {items.map((it) => (
        <div key={`${it.label}-${it.color}`} className="flex items-center gap-2 text-xs">
          <span className="inline-block size-3 rounded border" style={{ background: it.color }} />
          <span className="truncate">{it.label}</span>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- kontextové menu
function ContextMenu({ x, y, onClose, items }: {
  x: number; y: number; onClose: () => void;
  items: Array<{ label: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void }>;
}) {
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-ctx-menu]")) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div data-ctx-menu className="fixed z-50 min-w-[180px] rounded-md border bg-popover text-popover-foreground shadow-md p-1" style={{ left: x, top: y }}>
      {items.map((it) => (
        <button key={it.label} type="button"
          className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted ${it.danger ? "text-destructive" : ""}`}
          onClick={() => { it.onClick(); onClose(); }}
        >
          {it.icon}{it.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- plátno
function CanvasViewport({
  viewportRef, canvasRef, zoom, setZoom, layout, pxPerMeter, readOnly, guides,
  onDrop, onBackgroundPointerDown, children, bgUrl, bgOpacity,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  layout: LayoutData;
  pxPerMeter: number;
  readOnly: boolean;
  guides: { v: number[]; h: number[] };
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
      setZoom((z) => Math.max(0.2, Math.min(3, Math.round(z * delta * 100) / 100)));
    }
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [viewportRef, setZoom]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    let startDist = 0;
    let startZoom = 1;
    function dist(t: TouchList) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    function onStart(e: TouchEvent) { if (e.touches.length !== 2) return; startDist = dist(e.touches); setZoom((z) => { startZoom = z; return z; }); }
    function onMove(e: TouchEvent) {
      if (e.touches.length !== 2 || startDist === 0) return;
      e.preventDefault();
      const ratio = dist(e.touches) / startDist;
      setZoom(() => Math.max(0.2, Math.min(3, Math.round(startZoom * ratio * 100) / 100)));
    }
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

  // Jemná mriežka po 20 px a výrazná po metroch — mierka je tak vidieť priamo v pláne.
  const meter = Math.max(8, pxPerMeter);
  const background = [
    `linear-gradient(to right, #cbd5e1 1px, transparent 1px)`,
    `linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)`,
    `linear-gradient(to right, #eef2f7 1px, transparent 1px)`,
    `linear-gradient(to bottom, #eef2f7 1px, transparent 1px)`,
  ].join(",");
  const backgroundSize = `${meter}px ${meter}px, ${meter}px ${meter}px, ${GRID}px ${GRID}px, ${GRID}px ${GRID}px`;

  return (
    <div
      ref={viewportRef}
      className="overflow-auto rounded-lg border bg-slate-50 print:border-0"
      style={{ maxHeight: "calc(100vh - 210px)", minHeight: 360, touchAction: "pan-x pan-y" }}
    >
      <div style={{ width: layout.width * zoom, height: layout.height * zoom, position: "relative" }}>
        <div
          ref={canvasRef}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onBackgroundPointerDown(e); }}
          onContextMenu={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
          className="relative bg-white ring-2 ring-slate-400"
          style={{
            width: layout.width, height: layout.height,
            transform: `scale(${zoom})`, transformOrigin: "0 0",
            backgroundImage: background,
            backgroundSize,
          }}
        >
          {bgUrl && (
            <img src={bgUrl} alt="" draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: bgOpacity ?? 0.5, pointerEvents: "none", userSelect: "none" }} />
          )}

          {children}

          {/* Vodiace čiary pri prichytávaní. */}
          {guides.v.map((x) => (
            <div key={`v${x}`} className="absolute pointer-events-none" style={{ left: x, top: 0, width: 1, height: layout.height, background: "#ec4899", zIndex: 9998 }} />
          ))}
          {guides.h.map((y) => (
            <div key={`h${y}`} className="absolute pointer-events-none" style={{ left: 0, top: y, height: 1, width: layout.width, background: "#ec4899", zIndex: 9998 }} />
          ))}

          {/* Mierka v rohu — pri tlači je to jediné, podľa čoho sa dá plán odmerať. */}
          <div className="absolute pointer-events-none flex items-center gap-1"
            style={{ left: 8, bottom: 8, zIndex: 9997 }}>
            <div style={{ width: meter, height: 6, borderLeft: "2px solid #334155", borderRight: "2px solid #334155", borderBottom: "2px solid #334155" }} />
            <span className="text-[10px] font-medium text-slate-600 bg-white/80 px-1 rounded">1 m</span>
          </div>
          {!readOnly && layout.roomWidthM && layout.roomHeightM && (
            <div className="absolute pointer-events-none text-[11px] font-medium text-slate-500 bg-white/80 px-1 rounded"
              style={{ right: 8, bottom: 8, zIndex: 9997 }}>
              {layout.roomWidthM} × {layout.roomHeightM} m
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- prvok
function ElementNode({
  el, zoom, pxPerMeter, room, others, selected, readOnly, onSelect, onChange, onDragMany, onGuides,
  selectedCount, allSelected, onContextMenu,
}: {
  el: LayoutElement;
  zoom: number;
  pxPerMeter: number;
  room: { width: number; height: number };
  others: LayoutElement[];
  selected: boolean;
  readOnly: boolean;
  onSelect: (additive: boolean) => void;
  onChange: (patch: Partial<LayoutElement>, key?: string) => void;
  onDragMany: (dx: number, dy: number) => void;
  onGuides: (g: { v: number[]; h: number[] }) => void;
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
    if (el.locked) { if (mode === "move") onSelect(e.shiftKey); return; }
    e.stopPropagation();
    const additive = e.shiftKey;
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
    // Prichytávame len k prvkom, ktoré sa práve nehýbu.
    const snapTargets = others.filter((o) => o.id !== el.id && !(multi && allSelected.has(o.id)));

    function onMove(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / zoomFactor;
      const dy = (ev.clientY - startY) / zoomFactor;
      if (mode === "move") {
        let nx = orig.x + dx;
        let ny = orig.y + dy;
        if (rotated || ev.altKey) {
          // Otočený prvok a Alt = voľné kreslenie bez prichytávania.
          onGuides({ v: [], h: [] });
        } else {
          const s = computeSnap({ x: nx, y: ny, w: orig.w, h: orig.h }, snapTargets, room);
          nx = s.x; ny = s.y;
          onGuides({ v: s.guidesV, h: s.guidesH });
        }
        if (multi) {
          const incDx = nx - orig.x - lastAppliedRef.current.dx;
          const incDy = ny - orig.y - lastAppliedRef.current.dy;
          if (incDx || incDy) {
            onDragMany(incDx, incDy);
            lastAppliedRef.current = { dx: nx - orig.x, dy: ny - orig.y };
          }
          dragRef.current = null;
          return;
        }
        const next = { x: nx, y: ny, w: orig.w, h: orig.h };
        dragRef.current = next;
        setDrag(next);
        return;
      }
      const ldx = dx * cos - dy * sin;
      const ldy = dx * sin + dy * cos;
      let nw = Math.max(8, orig.w + ldx);
      let nh = Math.max(8, orig.h + ldy);
      if (ev.shiftKey) {
        // Shift drží pomer strán — okrúhly stôl tak zostane okrúhly.
        const ratio = orig.h / orig.w;
        nh = Math.max(8, nw * ratio);
      } else if (!rotated) {
        nw = Math.max(8, snap(nw));
        nh = Math.max(8, snap(nh));
      }
      const cx = orig.x + orig.w / 2, cy = orig.y + orig.h / 2;
      const next = { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
      dragRef.current = next;
      setDrag(next);
    }

    function onUp() {
      const final = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      onGuides({ v: [], h: [] });
      try { target.releasePointerCapture(e.pointerId); } catch { /* pointer už mohol zmiznúť */ }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (final) {
        onChange({
          x: Math.round(final.x),
          y: Math.round(final.y),
          w: Math.round(final.w),
          h: Math.round(final.h),
        });
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const display = drag ?? { x: el.x, y: el.y, w: el.w, h: el.h };
  const displayEl: LayoutElement = { ...el, ...display };

  function handleContextMenu(e: React.MouseEvent) {
    if (readOnly) return;
    e.preventDefault(); e.stopPropagation();
    if (!selected) onSelect(false);
    onContextMenu(e.clientX, e.clientY);
  }
  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === "touch") {
      const cx = e.clientX, cy = e.clientY;
      longPressTimer.current = setTimeout(() => { onSelect(false); onContextMenu(cx, cy); }, 550);
    }
    startDrag(e, "move");
  }
  function clearLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  return (
    <div
      style={{
        position: "absolute", left: display.x, top: display.y, width: display.w, height: display.h,
        transform: `rotate(${el.rotation}deg)`, transformOrigin: "center",
        touchAction: "none", zIndex: 1 + (el.z ?? 0),
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={clearLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onContextMenu={handleContextMenu}
      className={`${selected ? "outline outline-2 outline-primary" : ""} ${readOnly || el.locked ? "" : "cursor-move"}`}
    >
      <ElementVisual el={displayEl} />
      {el.locked && (
        <div className="absolute -top-2 -left-2 rounded-full bg-amber-500 text-white p-0.5 shadow" title="Zamknuté">
          <Lock className="size-3" />
        </div>
      )}
      {selected && !el.locked && (
        <>
          <div className="absolute -top-5 left-0 text-[10px] font-medium text-slate-600 bg-white/90 px-1 rounded border whitespace-nowrap pointer-events-none">
            {formatMeters(display.w, pxPerMeter)} × {formatMeters(display.h, pxPerMeter)}
          </div>
          <div
            onPointerDown={(e) => { e.stopPropagation(); startDrag(e, "resize"); }}
            className="absolute flex items-center justify-center cursor-se-resize"
            style={{ right: -12, bottom: -12, width: 24, height: 24, touchAction: "none" }}
            aria-label="Zmeniť veľkosť"
          >
            <div className="size-3 bg-primary rounded-sm shadow" />
          </div>
        </>
      )}
    </div>
  );
}

function ElementVisual({ el }: { el: LayoutElement }) {
  const { fill, stroke, text } = elementFill(el);
  const label = elementLabel(el);
  const base: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: text, background: fill, border: `2px solid ${stroke}` };

  if (el.type === "text") {
    return (
      <div className="w-full h-full flex items-center px-1 text-slate-900 font-semibold" style={{ fontSize: 13 }}>
        {label}
      </div>
    );
  }
  if (el.type === "chair") {
    const v = CHAIR_VARIANT_STYLE[el.chairVariant ?? "standard"];
    return (
      <div className="w-full h-full rounded grid place-items-center relative overflow-hidden"
        style={{ ...base, border: `1px solid ${v.stroke}`, fontSize: 10 }}>
        {v.badge && <span className="absolute top-0 right-0.5 text-[8px] font-extrabold" style={{ color: v.stroke }}>{v.badge}</span>}
        {label}
      </div>
    );
  }
  if (el.type === "stage") {
    return (
      <div className="w-full h-full rounded-md grid place-items-center text-white font-bold tracking-widest shadow-md overflow-hidden"
        style={{ background: "repeating-linear-gradient(90deg, #1f2937 0 24px, #111827 24px 48px)", border: "3px solid #f59e0b", fontSize: 14, letterSpacing: 3 }}>
        {label}
      </div>
    );
  }
  if (el.type === "round_table" || (el.type === "furniture" && el.shape === "round")) {
    return <div className="w-full h-full rounded-full grid place-items-center overflow-hidden" style={{ ...base, fontSize: el.type === "furniture" ? 10 : 12 }}>{label}</div>;
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
          return (
            <div key={i} className="absolute rounded bg-slate-200 border border-slate-400"
              style={{
                left: el.w / 2 + Math.cos(angle) * radius - chairSize / 2,
                top: el.h / 2 + Math.sin(angle) * radius - chairSize / 2,
                width: chairSize, height: chairSize,
              }} />
          );
        })}
        <div className="absolute rounded-full grid place-items-center"
          style={{
            left: (el.w - tableSize) / 2, top: (el.h - tableSize) / 2,
            width: tableSize, height: tableSize, ...base,
          }}>
          {label}
        </div>
      </div>
    );
  }
  const dashed = isZone(el.type);
  return (
    <div className="w-full h-full grid place-items-center overflow-hidden"
      style={{
        ...base,
        borderStyle: dashed ? "dashed" : "solid",
        borderRadius: el.type === "furniture" ? 4 : 6,
        fontSize: el.type === "furniture" ? 10 : el.type === "wall" ? 10 : 13,
      }}>
      {label}
    </div>
  );
}
