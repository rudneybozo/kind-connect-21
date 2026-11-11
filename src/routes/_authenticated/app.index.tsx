import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Plus,
  Users,
  PhoneCall,
  Bell,
  DollarSign,
} from "lucide-react";
import { ensureNotificationPermission, notifyOnce } from "@/lib/notifications";
import { format, isPast, isToday, isTomorrow, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { FilterBar } from "@/components/crm/FilterBar";
import { ClientFormDialog } from "@/components/crm/ClientFormDialog";
import { formatBRL, useAdminFilter, useLookups, type AdminFilter } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function formatDate(d: string) {
  const date = new Date(d);
  if (isToday(date)) return `Hoje, ${format(date, "HH:mm")}`;
  if (isTomorrow(date)) return `Amanhã, ${format(date, "HH:mm")}`;
  return format(date, "dd/MM 'às' HH:mm", { locale: ptBR });
}

type ClientRef = {
  name: string;
  company: string | null;
  user_id: string;
  store_id: string | null;
} | null;

/** Aplica o filtro de loja/vendedor pelo cliente relacionado (join !inner). */
function byClient<T extends { eq: (col: string, val: string) => T }>(query: T, f: AdminFilter): T {
  let q = query;
  if (f.storeId !== "all") q = q.eq("clients.store_id", f.storeId);
  if (f.sellerId !== "all") q = q.eq("clients.user_id", f.sellerId);
  return q;
}

function Dashboard() {
  const { effective, isAdmin } = useAdminFilter();
  const { personName } = useLookups();
  const [newOpen, setNewOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  const followUps = useQuery({
    queryKey: ["followups", effective],
    queryFn: async () => {
      const { data, error } = await byClient(
        supabase
          .from("interactions")
          .select(
            "id, follow_up_at, contact_person, notes, type, client_id, clients!inner(name, company, user_id, store_id)",
          )
          .eq("follow_up_done", false)
          .not("follow_up_at", "is", null)
          .order("follow_up_at", { ascending: true }),
        effective,
      );
      if (error) throw error;
      return data || [];
    },
  });

  const postSales = useQuery({
    queryKey: ["postsales", effective],
    queryFn: async () => {
      const { data, error } = await byClient(
        supabase
          .from("sales")
          .select(
            "id, sold_at, post_sale_due_at, amount, description, client_id, clients!inner(name, company, user_id, store_id)",
          )
          .is("post_sale_done_at", null)
          .order("post_sale_due_at", { ascending: true }),
        effective,
      );
      if (error) throw error;
      return data || [];
    },
  });

  const monthSales = useQuery({
    queryKey: ["monthSales", effective],
    queryFn: async () => {
      const { data, error } = await byClient(
        supabase
          .from("sales")
          .select("amount, clients!inner(user_id, store_id)")
          .gte("sold_at", startOfMonth(new Date()).toISOString()),
        effective,
      );
      if (error) throw error;
      const rows = data || [];
      return { count: rows.length, total: rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0) };
    },
  });

  const clientsCount = useQuery({
    queryKey: ["clientsCount", effective],
    queryFn: async () => {
      let q = supabase.from("clients").select("id", { count: "exact", head: true });
      if (effective.storeId !== "all") q = q.eq("store_id", effective.storeId);
      if (effective.sellerId !== "all") q = q.eq("user_id", effective.sellerId);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const dueFollowUps = useMemo(
    () => (followUps.data || []).filter((f) => f.follow_up_at && isPast(new Date(f.follow_up_at))),
    [followUps.data],
  );
  const upcomingFollowUps = useMemo(
    () => (followUps.data || []).filter((f) => f.follow_up_at && !isPast(new Date(f.follow_up_at))),
    [followUps.data],
  );
  const duePostSales = useMemo(
    () => (postSales.data || []).filter((s) => isPast(new Date(s.post_sale_due_at))),
    [postSales.data],
  );
  const upcomingPostSales = useMemo(
    () => (postSales.data || []).filter((s) => !isPast(new Date(s.post_sale_due_at))),
    [postSales.data],
  );

  // Alertas do navegador para pendências vencidas
  useEffect(() => {
    dueFollowUps.forEach((f) => {
      const client = (f.clients as ClientRef)?.name || "Cliente";
      notifyOnce(
        `fu-${f.id}`,
        "Retorno pendente",
        `${client} — agendado para ${formatDate(f.follow_up_at!)}`,
      );
    });
    duePostSales.forEach((s) => {
      const client = (s.clients as ClientRef)?.name || "Cliente";
      notifyOnce(`ps-${s.id}`, "Pós-venda pendente", `Faça o pós-venda com ${client}`);
    });
  }, [dueFollowUps, duePostSales]);

  async function markFollowUpDone(id: string) {
    const { error } = await supabase
      .from("interactions")
      .update({ follow_up_done: true })
      .eq("id", id);
    if (error) return toast.error("Falha ao atualizar: " + error.message);
    toast.success("Retorno marcado como feito");
    followUps.refetch();
  }
  async function markPostSaleDone(id: string) {
    const { error } = await supabase
      .from("sales")
      .update({ post_sale_done_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error("Falha ao atualizar: " + error.message);
    toast.success("Pós-venda concluído");
    postSales.refetch();
  }

  async function enableNotifs() {
    const p = await ensureNotificationPermission();
    if (p === "granted") toast.success("Alertas ativados");
    else toast.error("O navegador bloqueou os alertas");
  }

  const canNotify = typeof window !== "undefined" && "Notification" in window;
  const permission = canNotify ? Notification.permission : "denied";
  const sellerLabel = (c: ClientRef) => (isAdmin && c ? ` · ${personName(c.user_id)}` : "");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">Painel</h1>
          <p className="text-sm text-muted-foreground">Retornos, pós-vendas e vendas do mês.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canNotify && permission !== "granted" && (
            <Button variant="outline" size="sm" onClick={enableNotifs} aria-label="Ativar alertas">
              <Bell className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Ativar alertas</span>
            </Button>
          )}
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo cliente
          </Button>
        </div>
      </div>

      <FilterBar />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Clientes"
          value={clientsCount.data ?? "—"}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          label="Retornos atrasados"
          value={followUps.isLoading ? "—" : dueFollowUps.length}
          accent={dueFollowUps.length > 0}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Pós-venda pendente"
          value={postSales.isLoading ? "—" : duePostSales.length + upcomingPostSales.length}
        />
        <StatCard
          icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
          label={`Vendas em ${format(new Date(), "MMMM", { locale: ptBR })}`}
          value={monthSales.data ? formatBRL(monthSales.data.total) : "—"}
          hint={monthSales.data ? `${monthSales.data.count} venda(s)` : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5" /> Retornos pendentes
          </CardTitle>
          <CardDescription>Visitas e ligações agendadas para retornar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {followUps.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {followUps.error && (
            <p className="text-sm text-destructive">Erro: {followUps.error.message}</p>
          )}
          {!followUps.isLoading && followUps.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum retorno agendado.</p>
          )}
          {[...dueFollowUps, ...upcomingFollowUps].slice(0, 10).map((f) => {
            const overdue = isPast(new Date(f.follow_up_at!));
            const client = f.clients as ClientRef;
            return (
              <div
                key={f.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border rounded-lg p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to="/app/clientes/$id"
                      params={{ id: f.client_id }}
                      className="font-medium truncate hover:underline"
                    >
                      {client?.name || "Cliente"}
                    </Link>
                    {client?.company && (
                      <span className="text-xs text-muted-foreground truncate">
                        · {client.company}
                      </span>
                    )}
                    <Badge variant={overdue ? "destructive" : "secondary"}>
                      {formatDate(f.follow_up_at!)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {f.contact_person ? `Com: ${f.contact_person}` : "Retorno"}
                    {sellerLabel(client)}
                  </p>
                  {f.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{f.notes}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markFollowUpDone(f.id)}
                  aria-label="Feito"
                  className="shrink-0"
                >
                  <CheckCircle2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Feito</span>
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PhoneCall className="h-5 w-5" /> Pós-venda
          </CardTitle>
          <CardDescription>Lembrete 3 dias após cada venda</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {postSales.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {postSales.error && (
            <p className="text-sm text-destructive">Erro: {postSales.error.message}</p>
          )}
          {!postSales.isLoading && postSales.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum pós-venda pendente.</p>
          )}
          {[...duePostSales, ...upcomingPostSales].slice(0, 10).map((s) => {
            const overdue = isPast(new Date(s.post_sale_due_at));
            const client = s.clients as ClientRef;
            return (
              <div
                key={s.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border rounded-lg p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to="/app/clientes/$id"
                      params={{ id: s.client_id }}
                      className="font-medium truncate hover:underline"
                    >
                      {client?.name || "Cliente"}
                    </Link>
                    {client?.company && (
                      <span className="text-xs text-muted-foreground truncate">
                        · {client.company}
                      </span>
                    )}
                    <Badge variant={overdue ? "destructive" : "secondary"}>
                      {formatDate(s.post_sale_due_at)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Vendido em {format(new Date(s.sold_at), "dd/MM/yyyy", { locale: ptBR })}
                    {s.amount != null && ` · ${formatBRL(s.amount)}`}
                    {sellerLabel(client)}
                  </p>
                  {s.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{s.description}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markPostSaleDone(s.id)}
                  aria-label="Concluir"
                  className="shrink-0"
                >
                  <CheckCircle2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Concluir</span>
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <ClientFormDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSaved={(id) => {
          setNewOpen(false);
          router.navigate({ to: "/app/clientes/$id", params: { id } });
        }}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span className="truncate first-letter:uppercase">{label}</span>
        </div>
        <div className={`text-2xl font-bold mt-1 truncate ${accent ? "text-destructive" : ""}`}>
          {value}
        </div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
