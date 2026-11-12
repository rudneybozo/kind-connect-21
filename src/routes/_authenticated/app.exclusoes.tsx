import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, Trash2, User, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { useLookups } from "@/lib/crm";
import { fmtDateTime } from "@/lib/datetime";
import { ENTITY_LABEL } from "@/lib/activity";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/app/exclusoes")({
  beforeLoad: async () => {
    const { data } = await supabase.rpc("is_admin");
    if (!data) throw redirect({ to: "/app" });
  },
  component: DeletionRequestsPage,
});

type Request = Tables<"deletion_requests">;

function DeletionRequestsPage() {
  const requests = useQuery({
    queryKey: ["deletionRequests"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deletion_requests")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data || [];
    },
  });
  const pendingList = (requests.data || []).filter((r) => r.status === "pending");
  const decided = (requests.data || []).filter((r) => r.status !== "pending");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Solicitações de exclusão</h1>
        <p className="text-sm text-muted-foreground">
          Vendedores não excluem registros direto: eles pedem, e você aprova ou recusa. Registros
          excluídos ficam guardados.
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pendentes
            {pendingList.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5">
                {pendingList.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="decided">Decididas</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3 mt-4">
          {requests.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {requests.error && (
            <p className="text-sm text-destructive">Erro: {requests.error.message}</p>
          )}
          {!requests.isLoading && pendingList.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma solicitação pendente.
              </CardContent>
            </Card>
          )}
          {pendingList.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </TabsContent>

        <TabsContent value="decided" className="space-y-3 mt-4">
          {decided.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma decisão ainda.</p>
          )}
          {decided.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RequestCard({ request: r }: { request: Request }) {
  const qc = useQueryClient();
  const { personName } = useLookups();
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide() {
    if (!decision) return;
    setBusy(true);
    const { error } =
      decision === "approve"
        ? await supabase.rpc("approve_deletion", {
            p_request_id: r.id,
            p_note: note.trim() || null,
          })
        : await supabase.rpc("reject_deletion", {
            p_request_id: r.id,
            p_note: note.trim() || null,
          });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(decision === "approve" ? "Exclusão aprovada" : "Solicitação recusada");
    setDecision(null);
    setNote("");
    qc.invalidateQueries();
  }

  const statusBadge =
    r.status === "approved" ? (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">Aprovada</Badge>
    ) : r.status === "rejected" ? (
      <Badge variant="secondary">Recusada</Badge>
    ) : (
      <Badge className="bg-amber-500 hover:bg-amber-500">Pendente</Badge>
    );

  return (
    <Card className={r.status === "pending" ? "border-amber-400" : undefined}>
      <CardContent className="p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge}
          <Badge variant="outline" className="font-normal">
            {ENTITY_LABEL[r.entity_type] ?? r.entity_type}
          </Badge>
          <span className="font-medium">{r.entity_label}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" /> Pedido por {personName(r.requested_by)}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3" /> {fmtDateTime(r.requested_at)}
          </span>
        </div>
        {r.reason && (
          <p className="text-sm">
            <span className="text-muted-foreground">Motivo:</span> {r.reason}
          </p>
        )}
        {r.status !== "pending" && (
          <p className="text-xs text-muted-foreground">
            {r.status === "approved" ? "Aprovada" : "Recusada"} por {personName(r.decided_by)}
            {r.decided_at && ` em ${fmtDateTime(r.decided_at)}`}
            {r.decision_note && ` — ${r.decision_note}`}
          </p>
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-1">
          {r.client_id && r.status !== "approved" && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/clientes/$id" params={{ id: r.client_id }}>
                Ver cliente
              </Link>
            </Button>
          )}
          {r.status === "pending" && (
            <>
              <Button size="sm" variant="outline" onClick={() => setDecision("reject")}>
                <X className="h-4 w-4 mr-1" /> Recusar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setDecision("approve")}>
                <Check className="h-4 w-4 mr-1" /> Aprovar e excluir
              </Button>
            </>
          )}
        </div>
      </CardContent>

      <Dialog open={decision !== null} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "approve" ? "Aprovar a exclusão?" : "Recusar a solicitação?"}
            </DialogTitle>
            <DialogDescription>
              {decision === "approve"
                ? `${r.entity_label} sai das telas (continua guardado no banco). A aprovação e a exclusão vão para o Histórico.`
                : `O registro continua como está. A recusa vai para o Histórico de Atividades.`}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor={`note-${r.id}`}>Observação (opcional)</Label>
            <Textarea
              id={`note-${r.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant={decision === "approve" ? "destructive" : "default"}
              onClick={decide}
              disabled={busy}
            >
              {decision === "approve" ? (
                <>
                  <Trash2 className="h-4 w-4 mr-1" /> {busy ? "Excluindo…" : "Aprovar e excluir"}
                </>
              ) : busy ? (
                "Salvando…"
              ) : (
                "Recusar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
