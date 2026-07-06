import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ClipboardCheck, ClipboardList, FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, hasRole } from "@/hooks/use-current-user";
import { DEFAULT_CONTRACT_TERMS, formatDateTime } from "@/lib/document-utils";

type Props = { reservation: any };

export function DocumentsSection({ reservation }: Props) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canEdit = hasRole(user, "admin", "manager");

  const docs = useQuery({
    queryKey: ["res-documents", reservation.id],
    queryFn: async () => {
      const [c, p] = await Promise.all([
        supabase.from("contracts").select("id, contract_number, status, created_at, signed_at").eq("reservation_id", reservation.id).order("created_at", { ascending: false }),
        supabase.from("protocols").select("id, protocol_number, type, status, issued_at, signed_at").eq("reservation_id", reservation.id).order("issued_at", { ascending: false }),
      ]);
      if (c.error) throw c.error;
      if (p.error) throw p.error;
      return { contracts: c.data ?? [], protocols: p.data ?? [] };
    },
  });

  const buildSnapshot = () => ({
    client: {
      company_name: reservation.clients?.company_name ?? "",
      ico: reservation.clients?.ico ?? null,
      dic: reservation.clients?.dic ?? null,
      ic_dph: reservation.clients?.ic_dph ?? null,
      address: reservation.clients?.address ?? null,
      contact_person: reservation.contact_person ?? reservation.clients?.contact_person ?? null,
      phone: reservation.phone ?? null,
      email: reservation.email ?? null,
    },
    event: {
      event_name: reservation.event_name,
      venue: reservation.venue,
      address: reservation.address,
      load_at: reservation.load_at,
      depart_at: reservation.depart_at,
      event_start_at: reservation.event_start_at,
      event_end_at: reservation.event_end_at,
      return_at: reservation.return_at,
    },
    items: (reservation.reservation_items ?? []).map((ri: any) => ({
      furniture_item_id: ri.furniture_item_id,
      name: ri.furniture_items?.name ?? "—",
      code: ri.furniture_items?.internal_code ?? null,
      qty: ri.qty,
    })),
  });

  const createContract = useMutation({
    mutationFn: async () => {
      const snapshot = buildSnapshot();
      // Pull latest quote (if any) for totals
      const { data: q } = await supabase.from("quotes").select("id, total_with_vat")
        .eq("reservation_id", reservation.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await supabase.from("contracts").insert({
        reservation_id: reservation.id,
        quote_id: q?.id ?? null,
        data: snapshot,
        terms: DEFAULT_CONTRACT_TERMS,
        total_with_vat: q?.total_with_vat ?? null,
        created_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["res-documents", reservation.id] });
      toast.success("Zmluva vygenerovaná");
      window.location.href = `/documents/contract/${id}`;
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createProtocol = useMutation({
    mutationFn: async (kind: "handover" | "return") => {
      const snapshot = buildSnapshot();
      // If return, link to most recent handover and pull its items as expected
      let related_handover_id: string | null = null;
      let expectedItems: { furniture_item_id: string | null; name: string; code: string | null; qty: number }[] = snapshot.items;
      if (kind === "return") {
        const { data: ho } = await supabase.from("protocols").select("id")
          .eq("reservation_id", reservation.id).eq("type", "handover").order("issued_at", { ascending: false }).limit(1).maybeSingle();
        if (ho?.id) {
          related_handover_id = ho.id;
          const { data: hoItems } = await supabase.from("protocol_items").select("furniture_item_id, item_name, item_code, qty_actual").eq("protocol_id", ho.id);
          if (hoItems?.length) {
            expectedItems = hoItems.map((it: any) => ({
              furniture_item_id: it.furniture_item_id, name: it.item_name, code: it.item_code, qty: it.qty_actual,
            }));
          }
        }
      }
      const { data: ins, error } = await supabase.from("protocols").insert({
        reservation_id: reservation.id,
        type: kind,
        data: snapshot,
        issued_at: new Date().toISOString(),
        issued_by: user?.id ?? null,
        issued_by_name: user?.full_name ?? user?.email ?? null,
        received_by_name: snapshot.client.contact_person,
        related_handover_id,
        created_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      if (expectedItems.length) {
        const rows = expectedItems.map((it) => ({
          protocol_id: ins.id,
          furniture_item_id: it.furniture_item_id,
          item_name: it.name,
          item_code: it.code,
          qty_expected: it.qty,
          qty_actual: 0,
          condition: "ok" as const,
        }));
        const { error: e2 } = await supabase.from("protocol_items").insert(rows);
        if (e2) throw e2;
      }
      return ins.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["res-documents", reservation.id] });
      toast.success("Protokol vytvorený");
      window.location.href = `/documents/protocol/${id}`;
    },
    onError: (e: any) => toast.error(e.message),
  });

  const status = reservation.status as string;
  const canHandover = status === "confirmed" || status === "in_progress";
  const canReturn = status === "in_progress" || status === "returned" || status === "invoiced";
  const canContract = status !== "cancelled";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="size-4" /> Dokumenty
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!canContract || createContract.isPending} onClick={() => createContract.mutate()}>
              {createContract.isPending ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <FileSignature className="size-3.5 mr-1" />}
              Vygenerovať zmluvu
            </Button>
            <Button size="sm" variant="outline" disabled={!canHandover || createProtocol.isPending} onClick={() => createProtocol.mutate("handover")}>
              <ClipboardList className="size-3.5 mr-1" /> Odovzdávací protokol
            </Button>
            <Button size="sm" variant="outline" disabled={!canReturn || createProtocol.isPending} onClick={() => createProtocol.mutate("return")}>
              <ClipboardCheck className="size-3.5 mr-1" /> Preberací protokol
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Zmluvy</div>
          {docs.data?.contracts.length === 0 && <p className="text-xs text-muted-foreground">Žiadne zmluvy.</p>}
          {docs.data?.contracts.map((c: any) => (
            <Link key={c.id} to="/documents/contract/$id" params={{ id: c.id }} className="flex items-center justify-between p-2 rounded border hover:bg-muted/40">
              <div className="flex items-center gap-2">
                <FileSignature className="size-4 text-muted-foreground" />
                <span className="font-medium text-sm">{c.contract_number}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
              </div>
              <Badge variant={c.status === "signed" ? "default" : "outline"}>{c.status === "signed" ? "Podpísaná" : "Vygenerovaná"}</Badge>
            </Link>
          ))}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Protokoly</div>
          {docs.data?.protocols.length === 0 && <p className="text-xs text-muted-foreground">Žiadne protokoly.</p>}
          {docs.data?.protocols.map((p: any) => (
            <Link key={p.id} to="/documents/protocol/$id" params={{ id: p.id }} className="flex items-center justify-between p-2 rounded border hover:bg-muted/40">
              <div className="flex items-center gap-2">
                {p.type === "handover" ? <ClipboardList className="size-4 text-muted-foreground" /> : <ClipboardCheck className="size-4 text-muted-foreground" />}
                <span className="font-medium text-sm">{p.protocol_number}</span>
                <span className="text-xs text-muted-foreground">{p.type === "handover" ? "Odovzdávací" : "Preberací"} · {formatDateTime(p.issued_at)}</span>
              </div>
              <Badge variant={p.status === "signed" ? "default" : "outline"}>{p.status === "signed" ? "Podpísaný" : "Vygenerovaný"}</Badge>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}