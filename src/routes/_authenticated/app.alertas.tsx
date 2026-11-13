import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Check, User, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { useLookups } from "@/lib/crm";
import { fmtDateTime } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/app/alertas")({
  beforeLoad: async () => {
    const { data } = await supabase.rpc("is_admin");
    if (!data) throw redirect({ to: "/app" });
  },
  component: AlertsPage,
});

function AlertsPage() {
  const qc = useQueryClient();
  const { personName } = useLookups();
  const [tab, setTab] = useState<"open" | "all">("open");

  const alerts = useQuery({
    queryKey: ["attendanceAlerts", tab],
    refetchOnMount: "always",
    queryFn: async () => {
      let q = supabase
        .from("attendance_alerts")
        .select("*, clients(name)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (tab === "open") q = q.is("seen_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  async function markSeen(id: string) {
    const { error } = await supabase.rpc("mark_alert_seen", { p_alert_id: id });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["attendanceAlerts"] });
    qc.invalidateQueries({ queryKey: ["openAlertsCount"] });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Alertas de atendimento</h1>
        <p className="text-sm text-muted-foreground">
          Quando um vendedor registra contato ou venda com um cliente que outro vendedor atendeu nos
          últimos 60 dias. Só administradores veem esta tela.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "open" | "all")}>
        <TabsList>
          <TabsTrigger value="open">Não vistos</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>
      </Tabs>

      {alerts.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {alerts.error && <p className="text-sm text-destructive">Erro: {alerts.error.message}</p>}
      {!alerts.isLoading && alerts.data?.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum alerta {tab === "open" ? "pendente" : ""}.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {alerts.data?.map((a) => {
          const client = a.clients as { name?: string } | null;
          return (
            <Card key={a.id} className={!a.seen_at ? "border-amber-400" : undefined}>
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="font-medium">{personName(a.user_id)}</span>
                  <span className="text-sm">
                    registrou {a.record_type === "sale" ? "uma venda" : "um contato"} com
                  </span>
                  <Link
                    to="/app/clientes/$id"
                    params={{ id: a.client_id }}
                    className="font-medium underline"
                  >
                    {client?.name ?? "cliente"}
                  </Link>
                  {a.seen_at ? (
                    <Badge variant="secondary">Visto</Badge>
                  ) : (
                    <Badge className="bg-amber-500 hover:bg-amber-500">Novo</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" /> Já atendido por {personName(a.other_user_id)}
                    {a.other_last_at && ` (último contato em ${fmtDateTime(a.other_last_at)})`}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" /> {fmtDateTime(a.created_at)}
                  </span>
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">Motivo:</span>{" "}
                  {a.reason ?? <em>não informado</em>}
                </p>
                {a.seen_at ? (
                  <p className="text-xs text-muted-foreground">
                    Visto por {personName(a.seen_by)} em {fmtDateTime(a.seen_at)}
                  </p>
                ) : (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => markSeen(a.id)}>
                      <Check className="h-4 w-4 mr-1" /> Marcar como visto
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
