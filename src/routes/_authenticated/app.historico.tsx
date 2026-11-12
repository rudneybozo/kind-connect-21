import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, ShieldAlert, Loader2, Search, Link2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ACTION_LABEL,
  ENTITY_LABEL,
  shortHash,
  verifyChain,
  type ActivityLog,
  type ChainResult,
} from "@/lib/activity";

export const Route = createFileRoute("/_authenticated/app/historico")({
  beforeLoad: async () => {
    const { data } = await supabase.rpc("is_admin");
    if (!data) throw redirect({ to: "/app" });
  },
  component: ActivityLogPage,
});

const PAGE = 50;

const ACTION_STYLE: Record<string, string> = {
  CRIOU: "bg-emerald-600 hover:bg-emerald-600",
  EDITOU: "bg-sky-600 hover:bg-sky-600",
  EXCLUIU: "bg-red-600 hover:bg-red-600",
  SOLICITOU_EXCLUSAO: "bg-amber-500 hover:bg-amber-500",
  APROVOU_EXCLUSAO: "bg-red-500 hover:bg-red-500",
  RECUSOU_EXCLUSAO: "bg-slate-500 hover:bg-slate-500",
  TRANSFERIU: "bg-violet-600 hover:bg-violet-600",
};

/** Busca todo o histórico em ordem crescente, em lotes de 1000 */
async function fetchWholeChain(onProgress: (n: number) => void) {
  const all: ActivityLog[] = [];
  const batch = 1000;
  for (let from = 0; ; from += batch) {
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + batch - 1);
    if (error) throw error;
    all.push(...(data as ActivityLog[]));
    onProgress(all.length);
    if (!data || data.length < batch) break;
  }
  return all;
}

function ActivityLogPage() {
  const [action, setAction] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [verifying, setVerifying] = useState<number | null>(null);
  const [result, setResult] = useState<ChainResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const logs = useInfiniteQuery({
    queryKey: ["activityLogs", action, search],
    initialPageParam: 0,
    refetchOnMount: "always",
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("activity_logs")
        .select("*")
        .order("id", { ascending: false })
        .range(pageParam, pageParam + PAGE - 1);
      if (action !== "all") q = q.eq("action", action);
      if (search)
        q = q.or(
          `description.ilike.%${search.replace(/[%,()]/g, " ")}%,user_name.ilike.%${search.replace(/[%,()]/g, " ")}%`,
        );
      const { data, error } = await q;
      if (error) throw error;
      return data as ActivityLog[];
    },
    getNextPageParam: (last, pages) => (last.length === PAGE ? pages.length * PAGE : undefined),
  });

  async function runVerification() {
    setResult(null);
    setVerifyError(null);
    setVerifying(0);
    try {
      const rows = await fetchWholeChain((n) => setVerifying(n));
      setResult(await verifyChain(rows));
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : String(e));
    } finally {
      setVerifying(null);
    }
  }

  const rows = logs.data?.pages.flat() ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Histórico de Atividades</h1>
          <p className="text-sm text-muted-foreground">
            Cada registro guarda o hash do anterior, como uma corrente. Qualquer alteração ou
            remoção quebra a corrente.
          </p>
        </div>
        <Button onClick={runVerification} disabled={verifying !== null} className="shrink-0">
          {verifying !== null ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4 mr-2" />
          )}
          {verifying !== null ? `Verificando… ${verifying}` : "Verificar Integridade da Cadeia"}
        </Button>
      </div>

      {result?.ok && (
        <div
          className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-800"
          role="status"
        >
          <ShieldCheck className="h-6 w-6 shrink-0" />
          <div>
            <div className="font-semibold">Cadeia íntegra e verificada</div>
            <div className="text-sm">
              {result.count} registro(s) recalculados desde o primeiro (GENESIS).
            </div>
          </div>
        </div>
      )}
      {result && !result.ok && (
        <div
          className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800"
          role="alert"
        >
          <ShieldAlert className="h-6 w-6 shrink-0" />
          <div>
            <div className="font-semibold">
              Alerta: adulteração detectada no registro #{result.brokenId}
            </div>
            <div className="text-sm">
              {result.reason === "hash"
                ? "O conteúdo deste registro não confere com o hash guardado — ele foi alterado."
                : "O elo com o registro anterior está quebrado — um registro anterior foi apagado, alterado ou inserido fora de ordem."}
            </div>
          </div>
        </div>
      )}
      {verifyError && (
        <p className="text-sm text-destructive">Não foi possível verificar: {verifyError}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_14rem] gap-2">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => setSearch(searchInput.trim())}
            placeholder="Buscar por descrição ou usuário (Enter)"
            className="pl-9"
          />
        </form>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger aria-label="Filtrar por ação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {Object.entries(ACTION_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {logs.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {logs.error && <p className="text-sm text-destructive">Erro: {logs.error.message}</p>}
      {!logs.isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma atividade encontrada.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <Card
            key={r.id}
            className={
              result && !result.ok && result.brokenId === r.id ? "border-red-500" : undefined
            }
          >
            <CardContent className="p-3 sm:p-4 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">#{r.id}</span>
                <span className="text-muted-foreground">
                  {format(new Date(r.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                </span>
                <span className="font-medium">{r.user_name}</span>
                <Badge className={ACTION_STYLE[r.action] ?? ""}>
                  {ACTION_LABEL[r.action] ?? r.action}
                </Badge>
                {r.entity_type && (
                  <Badge variant="outline" className="font-normal">
                    {ENTITY_LABEL[r.entity_type] ?? r.entity_type}
                  </Badge>
                )}
              </div>
              <p className="text-sm break-words">{r.description}</p>
              <p
                className="font-mono text-[11px] text-muted-foreground"
                title={`hash: ${r.current_hash}\nanterior: ${r.previous_hash}`}
              >
                hash {shortHash(r.current_hash)} · anterior {shortHash(r.previous_hash)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {logs.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => logs.fetchNextPage()}
            disabled={logs.isFetchingNextPage}
          >
            {logs.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      )}
    </div>
  );
}
