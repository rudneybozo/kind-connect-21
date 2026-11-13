import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  ChevronRight,
  Building2,
  Phone,
  Store as StoreIcon,
  User,
  IdCard,
  Users,
} from "lucide-react";
import { FilterBar } from "@/components/crm/FilterBar";
import { ClientFormDialog } from "@/components/crm/ClientFormDialog";
import { useAdminFilter, useLookups } from "@/lib/crm";
import { formatDocument, onlyDigits } from "@/lib/documents";

export const Route = createFileRoute("/_authenticated/app/clientes/")({
  component: ClientsPage,
});

type Sort = "recent" | "name";

function normalize(s: string | null | undefined) {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ClientsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [open, setOpen] = useState(false);
  const { effective, isAdmin } = useAdminFilter();
  const { storeName, personName } = useLookups();
  const debounced = useDebounced(q.trim(), 350);

  // Vendedor: clientes que cadastrou ou já atendeu. Admin: todos.
  const clients = useQuery({
    queryKey: ["clients", effective],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select(
          "id, name, legal_name, person_type, document, contact_person, phone, user_id, store_id, created_at",
        )
        .order("created_at", { ascending: false });
      if (effective.storeId !== "all") query = query.eq("store_id", effective.storeId);
      if (effective.sellerId !== "all") query = query.eq("user_id", effective.sellerId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Base do grupo (para o vendedor achar clientes que ainda não atende)
  const base = useQuery({
    queryKey: ["clientSearch", debounced],
    enabled: !isAdmin && debounced.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_clients", {
        p_query: debounced,
        p_limit: 30,
      });
      if (error) throw error;
      return (data ?? []).filter((r) => !r.is_mine);
    },
  });

  const filtered = useMemo(() => {
    const s = normalize(q.trim());
    const sd = onlyDigits(q);
    const list = (clients.data || []).filter((c) => {
      if (!s) return true;
      return (
        [c.name, c.legal_name, c.contact_person].some((v) => normalize(v).includes(s)) ||
        (sd.length >= 3 && [c.document, onlyDigits(c.phone)].some((v) => (v ?? "").includes(sd)))
      );
    });
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return list;
  }, [clients.data, q, sort]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {clients.isLoading
              ? "Carregando…"
              : isAdmin
                ? `${clients.data?.length ?? 0} na base`
                : `${clients.data?.length ?? 0} que você cadastrou ou atende`}
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo cliente
        </Button>
      </div>

      <FilterBar />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              isAdmin
                ? "Buscar por nome, CNPJ/CPF ou telefone"
                : "Buscar na base do grupo: nome, CNPJ/CPF ou telefone"
            }
            className="pl-9"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-36" aria-label="Ordenar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="name">Nome (A–Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {clients.error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Erro ao carregar clientes: {clients.error.message}
          </CardContent>
        </Card>
      )}

      {!clients.isLoading &&
        !clients.error &&
        filtered.length === 0 &&
        !(base.data && base.data.length > 0) && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {clients.data?.length === 0 && !q
                ? "Nenhum cliente aqui ainda. Toque em “Novo cliente” para começar."
                : "Nenhum cliente encontrado."}
            </CardContent>
          </Card>
        )}

      {!isAdmin && filtered.length > 0 && q && (
        <h2 className="text-sm font-semibold text-muted-foreground">Seus clientes</h2>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((c) => (
          <Link key={c.id} to="/app/clientes/$id" params={{ id: c.id }} className="group block">
            <Card className="hover:border-primary/50 transition-colors h-full">
              <CardContent className="p-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  {c.legal_name && c.legal_name !== c.name && (
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {c.legal_name}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                    {c.document ? (
                      <span className="inline-flex items-center gap-1">
                        <IdCard className="h-3 w-3" />
                        {formatDocument(c.document, c.person_type)}
                      </span>
                    ) : (
                      c.person_type === "pj" && <span className="text-amber-700">sem CNPJ</span>
                    )}
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </span>
                    )}
                    {c.contact_person && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {c.contact_person}
                      </span>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      <Badge variant="outline" className="text-[11px] font-normal">
                        <StoreIcon className="h-3 w-3 mr-1" />
                        {storeName(c.store_id)}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        <User className="h-3 w-3 mr-1" />
                        {personName(c.user_id)}
                      </Badge>
                    </div>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 group-hover:text-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {!isAdmin && base.data && base.data.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
            <Users className="h-4 w-4" /> Na base do grupo
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {base.data.map((c) => (
              <Link key={c.id} to="/app/clientes/$id" params={{ id: c.id }} className="group block">
                <Card className="border-dashed hover:border-primary/50 transition-colors h-full">
                  <CardContent className="p-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{c.name}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                        {c.document && (
                          <span className="inline-flex items-center gap-1">
                            <IdCard className="h-3 w-3" />
                            {formatDocument(c.document, c.person_type)}
                          </span>
                        )}
                        {c.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {c.phone}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        Cadastrado por {c.origin_name} · {c.origin_store}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 group-hover:text-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <ClientFormDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={(id) => {
          setOpen(false);
          clients.refetch();
          router.navigate({ to: "/app/clientes/$id", params: { id } });
        }}
      />
    </div>
  );
}
