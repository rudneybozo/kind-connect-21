import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CalendarClock, CheckCircle2, Plus, Users, PhoneCall, Bell } from "lucide-react";
import { ensureNotificationPermission, notifyOnce } from "@/lib/notifications";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Painel | Vendas CRM" }] }),
  component: Dashboard,
});

function formatDate(d: string) {
  const date = new Date(d);
  if (isToday(date)) return `Hoje, ${format(date, "HH:mm")}`;
  if (isTomorrow(date)) return `Amanhã, ${format(date, "HH:mm")}`;
  return format(date, "dd/MM 'às' HH:mm", { locale: ptBR });
}

function Dashboard() {
  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  const followUps = useQuery({
    queryKey: ["followups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interactions")
        .select("id, follow_up_at, contact_person, notes, type, client_id, clients(name, company)")
        .eq("follow_up_done", false)
        .not("follow_up_at", "is", null)
        .order("follow_up_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const postSales = useQuery({
    queryKey: ["postsales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sold_at, post_sale_due_at, amount, description, client_id, clients(name, company)")
        .is("post_sale_done_at", null)
        .order("post_sale_due_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const clientsCount = useQuery({
    queryKey: ["clientsCount"],
    queryFn: async () => {
      const { count, error } = await supabase.from("clients").select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const dueFollowUps = useMemo(
    () => (followUps.data || []).filter((f) => f.follow_up_at && isPast(new Date(f.follow_up_at))),
    [followUps.data]
  );
  const upcomingFollowUps = useMemo(
    () => (followUps.data || []).filter((f) => f.follow_up_at && !isPast(new Date(f.follow_up_at))),
    [followUps.data]
  );
  const duePostSales = useMemo(
    () => (postSales.data || []).filter((s) => isPast(new Date(s.post_sale_due_at))),
    [postSales.data]
  );
  const upcomingPostSales = useMemo(
    () => (postSales.data || []).filter((s) => !isPast(new Date(s.post_sale_due_at))),
    [postSales.data]
  );

  // Browser notifications for items due today/past
  useEffect(() => {
    dueFollowUps.forEach((f) => {
      const client = (f.clients as { name?: string } | null)?.name || "Cliente";
      notifyOnce(`fu-${f.id}`, "Retorno pendente", `${client} — agendado para ${formatDate(f.follow_up_at!)}`);
    });
    duePostSales.forEach((s) => {
      const client = (s.clients as { name?: string } | null)?.name || "Cliente";
      notifyOnce(`ps-${s.id}`, "Pós-venda pendente", `Faça o pós-venda com ${client}`);
    });
  }, [dueFollowUps, duePostSales]);

  async function markFollowUpDone(id: string) {
    const { error } = await supabase.from("interactions").update({ follow_up_done: true }).eq("id", id);
    if (error) return toast.error("Falha ao atualizar");
    toast.success("Retorno marcado como feito");
    followUps.refetch();
  }
  async function markPostSaleDone(id: string) {
    const { error } = await supabase.from("sales").update({ post_sale_done_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error("Falha ao atualizar");
    toast.success("Pós-venda concluído");
    postSales.refetch();
  }

  async function enableNotifs() {
    const p = await ensureNotificationPermission();
    if (p === "granted") toast.success("Notificações ativadas");
    else toast.error("Permissão negada pelo navegador");
  }

  const canNotify = typeof window !== "undefined" && "Notification" in window;
  const permission = canNotify ? Notification.permission : "denied";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">Painel</h1>
          <p className="text-sm text-muted-foreground">Acompanhe retornos e pós-vendas pendentes.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canNotify && permission !== "granted" && (
            <Button variant="outline" size="sm" onClick={enableNotifs}>
              <Bell className="h-4 w-4 mr-2" /> Ativar alertas
            </Button>
          )}
          <Button asChild size="sm">
            <Link to="/app/clientes"><Plus className="h-4 w-4 mr-2" /> Novo cliente</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Clientes" value={clientsCount.data ?? "—"} />
        <StatCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Retornos atrasados" value={dueFollowUps.length} accent />
        <StatCard icon={<CalendarClock className="h-4 w-4" />} label="Próximos retornos" value={upcomingFollowUps.length} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Pós-venda pendente" value={duePostSales.length + upcomingPostSales.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-destructive" /> Retornos pendentes</CardTitle>
          <CardDescription>Visitas/ligações agendadas para retornar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {followUps.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!followUps.isLoading && followUps.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum retorno agendado.</p>
          )}
          {[...dueFollowUps, ...upcomingFollowUps].slice(0, 8).map((f) => {
            const overdue = isPast(new Date(f.follow_up_at!));
            const client = f.clients as { name?: string; company?: string | null } | null;
            return (
              <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border rounded-lg p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to="/app/clientes/$id" params={{ id: f.client_id }} className="font-medium truncate hover:underline">
                      {client?.name || "Cliente"}
                    </Link>
                    {client?.company && <span className="text-xs text-muted-foreground truncate">· {client.company}</span>}
                    <Badge variant={overdue ? "destructive" : "secondary"}>{formatDate(f.follow_up_at!)}</Badge>
                  </div>
                  {f.contact_person && <p className="text-xs text-muted-foreground truncate">Com: {f.contact_person}</p>}
                  {f.notes && <p className="text-xs text-muted-foreground line-clamp-1">{f.notes}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => markFollowUpDone(f.id)} className="shrink-0">
                  <CheckCircle2 className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Feito</span>
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><PhoneCall className="h-5 w-5" /> Pós-venda</CardTitle>
          <CardDescription>Lembrete 3 dias após cada venda</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {postSales.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!postSales.isLoading && postSales.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum pós-venda pendente.</p>
          )}
          {[...duePostSales, ...upcomingPostSales].slice(0, 8).map((s) => {
            const overdue = isPast(new Date(s.post_sale_due_at));
            const client = s.clients as { name?: string; company?: string | null } | null;
            return (
              <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border rounded-lg p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to="/app/clientes/$id" params={{ id: s.client_id }} className="font-medium truncate hover:underline">
                      {client?.name || "Cliente"}
                    </Link>
                    {client?.company && <span className="text-xs text-muted-foreground truncate">· {client.company}</span>}
                    <Badge variant={overdue ? "destructive" : "secondary"}>{formatDate(s.post_sale_due_at)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Vendido em {format(new Date(s.sold_at), "dd/MM/yyyy", { locale: ptBR })}
                    {s.amount != null && ` · R$ ${Number(s.amount).toFixed(2)}`}
                  </p>
                  {s.description && <p className="text-xs text-muted-foreground line-clamp-1">{s.description}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => markPostSaleDone(s.id)} className="shrink-0">
                  <CheckCircle2 className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Concluir</span>
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span className="truncate">{label}</span></div>
        <div className={`text-2xl font-bold mt-1 ${accent ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
