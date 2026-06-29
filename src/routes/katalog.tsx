import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getPublicCatalog,
  submitPublicInquiry,
  type PublicCatalogItem,
  type PublicCatalogCategory,
} from "@/lib/public-catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ImageOff, Minus, Plus, Search, ShoppingBag, Trash2, CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/katalog")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Katalóg nábytku · Mima Production" },
      { name: "description", content: "Verejný katalóg eventového nábytku Mima Production. Vyberte si položky a pošlite nezáväzný dopyt." },
    ],
  }),
  component: PublicCatalog,
});

type CartEntry = { qty: number };
type Cart = Record<string, CartEntry>;

function PublicCatalog() {
  const loadFn = useServerFn(getPublicCatalog);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PublicCatalogItem[]>([]);
  const [categories, setCategories] = useState<PublicCatalogCategory[]>([]);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [cart, setCart] = useState<Cart>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const data = await loadFn();
        if (cancel) return;
        setItems(data.items);
        setCategories(data.categories);
      } catch (e: any) {
        toast.error(e?.message ?? "Nepodarilo sa načítať katalóg");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [loadFn]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (cat !== "all" && i.category_id !== cat) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.public_description ?? "").toLowerCase().includes(q) ||
        i.category_name.toLowerCase().includes(q)
      );
    });
  }, [items, search, cat]);

  const grouped = useMemo(() => {
    const map = new Map<string, { cat: PublicCatalogCategory; list: PublicCatalogItem[] }>();
    for (const c of categories) map.set(c.id, { cat: c, list: [] });
    for (const i of filtered) {
      const g = map.get(i.category_id);
      if (g) g.list.push(i);
    }
    return Array.from(map.values()).filter((g) => g.list.length > 0);
  }, [categories, filtered]);

  const cartCount = useMemo(() => Object.values(cart).reduce((s, e) => s + e.qty, 0), [cart]);

  const inc = (id: string) => setCart((c) => ({ ...c, [id]: { qty: (c[id]?.qty ?? 0) + 1 } }));
  const dec = (id: string) => setCart((c) => {
    const q = (c[id]?.qty ?? 0) - 1;
    if (q <= 0) { const next = { ...c }; delete next[id]; return next; }
    return { ...c, [id]: { qty: q } };
  });
  const remove = (id: string) => setCart((c) => { const n = { ...c }; delete n[id]; return n; });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4">
          <img src="/mima-logo.png" alt="Mima Production" className="h-10 w-auto" />
          <div className="flex-1">
            <div className="font-semibold leading-tight">Mima Production</div>
            <div className="text-xs text-muted-foreground">Prenájom eventového nábytku</div>
          </div>
          <a href="mailto:info@mimaproduction.sk" className="hidden md:inline text-sm text-muted-foreground hover:underline">info@mimaproduction.sk</a>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="default" className="relative">
                <ShoppingBag className="size-4 mr-2" />
                Dopyt
                {cartCount > 0 && (
                  <Badge className="ml-2 h-5 min-w-5 px-1.5">{cartCount}</Badge>
                )}
              </Button>
            </SheetTrigger>
            <InquirySheet cart={cart} items={items} onClear={() => setCart({})} onRemove={remove} onClose={() => setOpen(false)} />
          </Sheet>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Katalóg nábytku</h1>
          <p className="text-muted-foreground mt-1 text-sm">Vyberte si položky a pošlite nezáväzný dopyt. Ozveme sa Vám s ponukou a dostupnosťou.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hľadať v katalógu" className="pl-9" />
          </div>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="sm:w-64"><SelectValue placeholder="Kategória" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všetky kategórie</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="py-20 text-center text-muted-foreground"><Loader2 className="size-5 animate-spin inline mr-2" />Načítavam…</div>
        ) : grouped.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Žiadne položky.</CardContent></Card>
        ) : (
          grouped.map(({ cat: c, list }) => (
            <div key={c.id} className="space-y-3">
              <div className="flex items-baseline gap-3">
                <h2 className="text-xl font-semibold">{c.name}</h2>
                <span className="text-xs text-muted-foreground">{list.length} položiek</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map((i) => {
                  const qty = cart[i.id]?.qty ?? 0;
                  return (
                    <Card key={i.id} className="overflow-hidden">
                      <div className="aspect-[4/3] bg-muted relative">
                        {i.photo_url ? (
                          <img src={i.photo_url} alt={i.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-muted-foreground">
                            <ImageOff className="size-8" />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold leading-tight">{i.name}</h3>
                            <div className="text-xs text-muted-foreground">{i.category_name}</div>
                          </div>
                          {i.public_price != null && (
                            <div className="text-right shrink-0">
                              <div className="font-semibold">{i.public_price.toFixed(2)} €</div>
                              <div className="text-[10px] text-muted-foreground">orient. cena</div>
                            </div>
                          )}
                        </div>
                        {i.public_description && <p className="text-sm text-muted-foreground line-clamp-3">{i.public_description}</p>}
                        {(i.dimensions || i.color) && (
                          <div className="text-xs text-muted-foreground flex gap-3">
                            {i.dimensions && <span>{i.dimensions}</span>}
                            {i.color && <span>{i.color}</span>}
                          </div>
                        )}
                        <div className="pt-2">
                          {qty === 0 ? (
                            <Button size="sm" onClick={() => inc(i.id)} className="w-full">
                              <Plus className="size-4 mr-1" />Pridať do dopytu
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button size="icon" variant="outline" onClick={() => dec(i.id)} aria-label="Znížiť"><Minus className="size-4" /></Button>
                              <div className="flex-1 text-center font-medium">{qty} ks</div>
                              <Button size="icon" variant="outline" onClick={() => inc(i.id)} aria-label="Zvýšiť"><Plus className="size-4" /></Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>

      <footer className="border-t mt-12">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} Mima Production</div>
          <div>info@mimaproduction.sk</div>
        </div>
      </footer>
    </div>
  );
}

function InquirySheet({
  cart, items, onClear, onRemove, onClose,
}: {
  cart: Cart;
  items: PublicCatalogItem[];
  onClear: () => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const submitFn = useServerFn(submitPublicInquiry);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "", company: "", email: "", phone: "",
    event_start_at: "", event_end_at: "", venue: "", message: "",
    website: "", // honeypot
  });

  const lines = useMemo(() => {
    return Object.entries(cart).map(([id, e]) => {
      const i = items.find((x) => x.id === id);
      return { id, qty: e.qty, name: i?.name ?? "(?)", category: i?.category_name ?? "" };
    });
  }, [cart, items]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) { toast.error("Pridajte aspoň jednu položku."); return; }
    if (!form.name.trim() || !form.email.trim()) { toast.error("Vyplňte meno a email."); return; }
    setSubmitting(true);
    try {
      await submitFn({ data: {
        name: form.name, company: form.company, email: form.email, phone: form.phone,
        event_start_at: form.event_start_at || null,
        event_end_at: form.event_end_at || null,
        venue: form.venue, message: form.message,
        items: lines.map((l) => ({ furniture_item_id: l.id, qty: l.qty })),
        website: form.website,
      }});
      setSubmitted(true);
      onClear();
    } catch (err: any) {
      toast.error(err?.message ?? "Nepodarilo sa odoslať dopyt.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
      <SheetHeader>
        <SheetTitle>Váš dopyt</SheetTitle>
      </SheetHeader>
      {submitted ? (
        <div className="py-10 text-center space-y-3">
          <CheckCircle2 className="size-12 mx-auto text-green-600" />
          <h3 className="text-lg font-semibold">Ďakujeme za dopyt!</h3>
          <p className="text-sm text-muted-foreground">Čoskoro Vás budeme kontaktovať s ponukou a dostupnosťou.</p>
          <Button onClick={onClose}>Zatvoriť</Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5 mt-4">
          <div>
            <div className="text-sm font-medium mb-2">Vybrané položky ({lines.length})</div>
            {lines.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded-md p-4 text-center">Košík dopytu je prázdny.</div>
            ) : (
              <ul className="border rounded-md divide-y">
                {lines.map((l) => (
                  <li key={l.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                    <div className="flex-1">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{l.category}</div>
                    </div>
                    <div className="font-medium">{l.qty} ks</div>
                    <Button type="button" size="icon" variant="ghost" onClick={() => onRemove(l.id)} aria-label="Odstrániť">
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Meno *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="col-span-2"><Label>Firma</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div><Label>Telefón</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Termín od</Label><Input type="datetime-local" value={form.event_start_at} onChange={(e) => setForm({ ...form, event_start_at: e.target.value })} /></div>
            <div><Label>Termín do</Label><Input type="datetime-local" value={form.event_end_at} onChange={(e) => setForm({ ...form, event_end_at: e.target.value })} /></div>
            <div className="col-span-2"><Label>Miesto eventu</Label><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Adresa alebo názov priestoru" /></div>
            <div className="col-span-2"><Label>Správa</Label><Textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Doplňujúce informácie, požiadavky…" /></div>
            {/* Honeypot — must remain empty for humans */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              style={{ position: "absolute", left: "-10000px", width: 1, height: 1, opacity: 0 }}
              aria-hidden="true"
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting || lines.length === 0}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}Odoslať dopyt
          </Button>
          <p className="text-[11px] text-muted-foreground">Odoslaním súhlasíte s tým, že Vás budeme kontaktovať ohľadom dopytu.</p>
        </form>
      )}
    </SheetContent>
  );
}