import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Store as StoreIcon, User } from "lucide-react";
import { displayName, useAdminFilter, useLookups } from "@/lib/crm";

/** Seletores de Loja e Vendedor — aparecem só para o administrador. */
export function FilterBar() {
  const { filter, setFilter, isAdmin } = useAdminFilter();
  const { stores, team } = useLookups();
  if (!isAdmin) return null;

  const sellers = (team.data || []).filter(
    (p) => p.active && (filter.storeId === "all" || p.store_id === filter.storeId),
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-2">
      <Select
        value={filter.storeId}
        onValueChange={(storeId) => {
          const sellerStillFits =
            filter.sellerId === "all" ||
            storeId === "all" ||
            team.data?.find((p) => p.id === filter.sellerId)?.store_id === storeId;
          setFilter({ storeId, sellerId: sellerStillFits ? filter.sellerId : "all" });
        }}
      >
        <SelectTrigger aria-label="Filtrar por loja" className="gap-2">
          <StoreIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-left">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as lojas</SelectItem>
          {(stores.data || []).map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
              {!s.active && " (inativa)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filter.sellerId}
        onValueChange={(sellerId) => setFilter({ ...filter, sellerId })}
      >
        <SelectTrigger aria-label="Filtrar por vendedor" className="gap-2">
          <User className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-left">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os vendedores</SelectItem>
          {sellers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {displayName(p)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
