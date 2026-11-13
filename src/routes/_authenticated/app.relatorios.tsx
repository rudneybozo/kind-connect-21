import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PAYMENT_METHODS, displayName, formatBRL, paymentLabel, useLookups } from "@/lib/crm";
import { fmtDate } from "@/lib/datetime";
import {
  exportExcel,
  exportPdf,
  fetchOpenPendencies,
  fetchProductivity,
  fetchSales,
  groupSales,
  summarize,
  type ExportTable,
  type ReportFilters,
} from "@/lib/report";

export const Route = createFileRoute("/_authenticated/app/relatorios")({
  beforeLoad: async () => {
    const { data } = await supabase.rpc("is_admin");
    if (!data) throw redirect({ to: "/app" });
  },
  component: ReportsPage,
});

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

const PRESETS = [
  { key: "month", label: "Este mês", range: () => [startOfMonth(new Date()), new Date()] },
  {
    key: "last-month",
    label: "Mês passado",
    range: () => [startOfMonth(subMonths(new Date(), 1)), endOfMonth(subMonths(new Date(), 1))],
  },
  { key: "30d", label: "Últimos 30 dias", range: () => [subDays(new Date(), 29), new Date()] },
  { key: "90d", label: "Últimos 90 dias", range: () => [subDays(new Date(), 89), new Date()] },
] as const;

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1 truncate">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ReportsPage() {
  const { stores, team, storeName, personName } = useLookups();
  const [filters, setFilters] = useState<ReportFilters>(() => ({
    from: ymd(startOfMonth(new Date())),
    to: ymd(new Date()),
    storeId: "all",
    sellerId: "all",
    method: "all",
  }));
  const [tab, setTab] = useState("sales");
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  const valid = filters.from && filters.to && filters.from <= filters.to;

  const sales = useQuery({
    queryKey: ["report-sales", filters],
    enabled: Boolean(valid),
    queryFn: () => fetchSales(filters),
  });
  const pendencies = useQuery({
    queryKey: ["report-pendencies", filters.storeId, filters.sellerId],
    queryFn: () => fetchOpenPendencies(filters),
  });
  const productivity = useQuery({
    queryKey: ["report-productivity", filters.from, filters.to, filters.storeId, filters.sellerId],
    enabled: Boolean(valid),
    queryFn: () => fetchProductivity(filters),
  });

  const sum = useMemo(() => summarize(sales.data ?? []), [sales.data]);
  const bySeller = useMemo(
    () =>
      groupSales(
        sales.data ?? [],
        (r) => r.user_id,
        (k) => personName(k),
      ),
    [sales.data, personName],
  );
  const byStore = useMemo(
    () =>
      groupSales(
        sales.data ?? [],
        (r) => r.store_id ?? "none",
        (k) => storeName(k === "none" ? null : k),
      ),
    [sales.data, storeName],
  );
  const byMethod = useMemo(
    () =>
      groupSales(
        sales.data ?? [],
        (r) => r.payment_method ?? "none",
        (k) => paymentLabel(k === "none" ? null : k),
      ),
    [sales.data],
  );
  const pendTotal = useMemo(() => summarize(pendencies.data ?? []), [pendencies.data]);

  const sellersForStore = (team.data ?? []).filter(
    (p) => filters.storeId === "all" || p.store_id === filters.storeId,
  );
  const set = (patch: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const filterText = [
    `Período: ${fmtDate(filters.from + "T12:00:00")} a ${fmtDate(filters.to + "T12:00:00")}`,
    `Loja: ${filters.storeId === "all" ? "todas" : storeName(filters.storeId)}`,
    `Vendedor: ${filters.sellerId === "all" ? "todos" : personName(filters.sellerId)}`,
    `Pagamento: ${filters.method === "all" ? "todas as formas" : paymentLabel(filters.method === "none" ? null : filters.method)}`,
  ].join("  |  ");

  function buildTables(): ExportTable[] {
    const groupTable = (title: string, first: string, rows: typeof bySeller): ExportTable => ({
      title,
      head: [first, "Vendas", "Total (R$)", "Ticket médio (R$)"],
      rows: rows.map((g) => [g.label, g.qty, g.total, g.ticket]),
      money: [2, 3],
    });
    return [
      {
        title: "Resumo de vendas",
        head: [
          "Vendas",
          "Total (R$)",
          "Ticket médio (R$)",
          "Pendências em aberto",
          "Valor em aberto (R$)",
        ],
        rows: [[sum.qty, sum.total, sum.ticket, pendTotal.qty, pendTotal.total]],
        money: [1, 2, 4],
      },
      groupTable("Por vendedor", "Vendedor", bySeller),
      groupTable("Por loja", "Loja", byStore),
      groupTable("Por forma de pagamento", "Forma de pagamento", byMethod),
      {
        title: "Vendas detalhadas",
        head: ["Data", "Cliente", "Vendedor", "Loja", "Pagamento", "NF", "Valor (R$)"],
        rows: (sales.data ?? []).map((s) => [
          fmtDate(s.sold_at),
          s.client_name + (s.settles_sale_id ? " (quitação)" : ""),
          personName(s.user_id),
          storeName(s.store_id),
          paymentLabel(s.payment_method),
          s.nf_number ?? "",
          Number(s.amount ?? 0),
        ]),
        money: [6],
      },
      {
        title: "Pendências em aberto",
        head: ["Data", "Cliente", "Vendedor", "Loja", "Dias em aberto", "Valor (R$)"],
        rows: (pendencies.data ?? []).map((s) => [
          fmtDate(s.sold_at),
          s.client_name,
          personName(s.user_id),
          storeName(s.store_id),
          Math.max(0, Math.floor((Date.now() - new Date(s.sold_at).getTime()) / 86400000)),
          Number(s.amount ?? 0),
        ]),
        money: [5],
      },
      {
        title: "Produtividade",
        head: [
          "Vendedor",
          "Contatos",
          "Retornos feitos",
          "Retornos atrasados (agora)",
          "Pós-vendas feitos",
          "Pós-vendas atrasados (agora)",
          "Clientes novos",
          "Vendas",
          "Total vendido (R$)",
          "Alertas de atendimento",
        ],
        rows: (productivity.data ?? []).map((p) => [
          personName(p.userId),
          p.contacts,
          p.followUpsDone,
          p.followUpsOverdue,
          p.postSalesDone,
          p.postSalesOverdue,
          p.newClients,
          p.sales,
          p.salesTotal,
          p.alerts,
        ]),
        money: [8],
      },
    ];
  }

  async function doExport(kind: "pdf" | "xlsx") {
    if (sales.isLoading || pendencies.isLoading || productivity.isLoading)
      return toast.info("Aguarde os dados carregarem");
    setExporting(kind);
    try {
      const name = `relatorio-vendas_${filters.from}_a_${filters.to}`;
      if (kind === "xlsx") await exportExcel(`${name}.xlsx`, buildTables());
      else
        await exportPdf(
          `${name}.pdf`,
          "Relatório de vendas e produtividade",
          filterText,
          buildTables(),
        );
    } catch (e) {
      toast.error("Não foi possível exportar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(null);
    }
  }

  const loading = sales.isLoading || productivity.isLoading;
  const error = sales.error || pendencies.error || productivity.error;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Vendas externas (pendências não entram no total; a quitação conta na data da NF).
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => doExport("xlsx")}
            disabled={exporting !== null || !valid}
          >
            {exporting === "xlsx" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => doExport("pdf")}
            disabled={exporting !== null || !valid}
          >
            {exporting === "pdf" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                variant="outline"
                size="sm"
                onClick={() => {
                  const [a, b] = p.range();
                  set({ from: ymd(a), to: ymd(b) });
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <Label htmlFor="r-from">De</Label>
              <Input
                id="r-from"
                type="date"
                value={filters.from}
                onChange={(e) => set({ from: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="r-to">Até</Label>
              <Input
                id="r-to"
                type="date"
                value={filters.to}
                onChange={(e) => set({ to: e.target.value })}
              />
            </div>
            <div>
              <Label>Loja</Label>
              <Select
                value={filters.storeId}
                onValueChange={(v) => set({ storeId: v, sellerId: "all" })}
              >
                <SelectTrigger aria-label="Loja">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as lojas</SelectItem>
                  {(stores.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendedor</Label>
              <Select value={filters.sellerId} onValueChange={(v) => set({ sellerId: v })}>
                <SelectTrigger aria-label="Vendedor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os vendedores</SelectItem>
                  {sellersForStore.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {displayName(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={filters.method} onValueChange={(v) => set({ method: v })}>
                <SelectTrigger aria-label="Forma de pagamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {PAYMENT_METHODS.filter((m) => m.value !== "pendencia").map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">Não informada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {!valid && (
            <p className="text-sm text-destructive">A data inicial precisa ser anterior à final.</p>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive">Erro ao carregar: {(error as Error).message}</p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total vendido" value={loading ? "—" : formatBRL(sum.total) || "R$ 0,00"} />
        <Stat label="Vendas" value={loading ? "—" : sum.qty} />
        <Stat label="Ticket médio" value={loading ? "—" : formatBRL(sum.ticket) || "R$ 0,00"} />
        <Stat
          label="Pendências em aberto"
          value={pendencies.isLoading ? "—" : formatBRL(pendTotal.total) || "R$ 0,00"}
          hint={`${pendTotal.qty} pendência(s)`}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="sales">Vendas</TabsTrigger>
          <TabsTrigger value="pending">Pendências</TabsTrigger>
          <TabsTrigger value="productivity">Produtividade</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4 mt-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <GroupCard title="Por vendedor" first="Vendedor" rows={bySeller} />
            <GroupCard title="Por loja" first="Loja" rows={byStore} />
            <GroupCard title="Por forma de pagamento" first="Pagamento" rows={byMethod} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Vendas no período ({sales.data?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sales.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        {loading ? "Carregando…" : "Nenhuma venda no período."}
                      </TableCell>
                    </TableRow>
                  )}
                  {(sales.data ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-nowrap">{fmtDate(s.sold_at)}</TableCell>
                      <TableCell>
                        <Link
                          to="/app/clientes/$id"
                          params={{ id: s.client_id }}
                          className="hover:underline"
                        >
                          {s.client_name}
                        </Link>
                        {s.settles_sale_id && (
                          <span className="text-xs text-muted-foreground"> (quitação)</span>
                        )}
                      </TableCell>
                      <TableCell>{personName(s.user_id)}</TableCell>
                      <TableCell>{storeName(s.store_id)}</TableCell>
                      <TableCell>{paymentLabel(s.payment_method)}</TableCell>
                      <TableCell>{s.nf_number ?? ""}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatBRL(s.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pendências em aberto ({pendTotal.qty})</CardTitle>
              <p className="text-xs text-muted-foreground">
                Todas as datas; filtradas por loja e vendedor.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead className="text-right">Dias</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pendencies.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {pendencies.isLoading ? "Carregando…" : "Nenhuma pendência em aberto."}
                      </TableCell>
                    </TableRow>
                  )}
                  {(pendencies.data ?? []).map((s) => {
                    const days = Math.max(
                      0,
                      Math.floor((Date.now() - new Date(s.sold_at).getTime()) / 86400000),
                    );
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="whitespace-nowrap">{fmtDate(s.sold_at)}</TableCell>
                        <TableCell>
                          <Link
                            to="/app/clientes/$id"
                            params={{ id: s.client_id }}
                            className="hover:underline"
                          >
                            {s.client_name}
                          </Link>
                        </TableCell>
                        <TableCell>{personName(s.user_id)}</TableCell>
                        <TableCell>{storeName(s.store_id)}</TableCell>
                        <TableCell
                          className={`text-right ${days > 30 ? "text-destructive font-medium" : ""}`}
                        >
                          {days}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatBRL(s.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="productivity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Produtividade por vendedor</CardTitle>
              <p className="text-xs text-muted-foreground">
                Contagens do período escolhido. “Atrasados” mostra a situação de agora.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Contatos</TableHead>
                    <TableHead className="text-right">Retornos feitos</TableHead>
                    <TableHead className="text-right">Retornos atrasados</TableHead>
                    <TableHead className="text-right">Pós-vendas feitos</TableHead>
                    <TableHead className="text-right">Pós-vendas atrasados</TableHead>
                    <TableHead className="text-right">Clientes novos</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Total vendido</TableHead>
                    <TableHead className="text-right">Alertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(productivity.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        {productivity.isLoading ? "Carregando…" : "Sem atividade no período."}
                      </TableCell>
                    </TableRow>
                  )}
                  {(productivity.data ?? []).map((p) => (
                    <TableRow key={p.userId}>
                      <TableCell className="font-medium">{personName(p.userId)}</TableCell>
                      <TableCell className="text-right">{p.contacts}</TableCell>
                      <TableCell className="text-right">{p.followUpsDone}</TableCell>
                      <TableCell
                        className={`text-right ${p.followUpsOverdue ? "text-destructive font-medium" : ""}`}
                      >
                        {p.followUpsOverdue}
                      </TableCell>
                      <TableCell className="text-right">{p.postSalesDone}</TableCell>
                      <TableCell
                        className={`text-right ${p.postSalesOverdue ? "text-destructive font-medium" : ""}`}
                      >
                        {p.postSalesOverdue}
                      </TableCell>
                      <TableCell className="text-right">{p.newClients}</TableCell>
                      <TableCell className="text-right">{p.sales}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatBRL(p.salesTotal) || "R$ 0,00"}
                      </TableCell>
                      <TableCell
                        className={`text-right ${p.alerts ? "text-amber-700 font-medium" : ""}`}
                      >
                        {p.alerts}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GroupCard({
  title,
  first,
  rows,
}: {
  title: string;
  first: string;
  rows: { key: string; label: string; qty: number; total: number; ticket: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{first}</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Ticket</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  —
                </TableCell>
              </TableRow>
            )}
            {rows.map((g) => (
              <TableRow key={g.key}>
                <TableCell className="font-medium">{g.label}</TableCell>
                <TableCell className="text-right">{g.qty}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {formatBRL(g.total) || "R$ 0,00"}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {formatBRL(g.ticket) || "R$ 0,00"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
