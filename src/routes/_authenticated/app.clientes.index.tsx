import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  Mail,
  Store as StoreIcon,
  User,
} from "lucide-react";
import { FilterBar } from "@/components/crm/FilterBar";
import { ClientFormDialog } from "@/components/crm/ClientFormDialog";
import { useAdminFilter, useLookups } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/app/clientes/")({
  component: ClientsPage,
});

type Sort = "recent" | "name";

function ClientsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [open, setOpen] = useState(false);
  const { effective, isAdmin } = useAdminFilter();
  const { storeName, personName } = useLookups();

  const clients = useQuery({
    queryKey: ["clients", effective],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("id, name, company, phone, email, user_id, store_id, created_at")
        .order("created_at", { ascending: false });
      if (effective.storeId !== "all") query = query.eq("store_id", effective.storeId);
      if (effective.sellerId !== "all") query = query.eq("user_id", effective.sellerId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (clients.data || []).filter((c) => {
      if (!s) return true;
      return [c.name, c.company, c.phone, c.email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s));
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
            {clients.isLoading ? "Carregando…" : `${clients.data?.length ?? 0} cadastrados`}
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
            placeholder="Buscar por nome, empresa, telefone ou email"
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

      {!clients.isLoading && !clients.error && filtered.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {clients.data?.length === 0
              ? "Nenhum cliente aqui ainda. Toque em “Novo cliente” para começar."
              : "Nenhum cliente encontrado."}
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((c) => (
          <Link key={c.id} to="/app/clientes/$id" params={{ id: c.id }} className="group block">
            <Card className="hover:border-primary/50 transition-colors h-full">
              <CardContent className="p-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  {c.company && (
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {c.company}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </span>
                    )}
                    {c.email && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <Mail className="h-3 w-3" />
                        {c.email}
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
