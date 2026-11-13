import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Store = Tables<"stores">;
export type Profile = Tables<"profiles">;

export const ADMIN_EMAIL = "rudneybozo@gmail.com";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatBRL(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  return brl.format(Number(value));
}

/** Converte "1.234,56" ou "1234.56" em número. Retorna null se vazio, NaN se inválido. */
export function parseBRL(input: string): number | null {
  const s = input.trim().replace(/R\$\s?/, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normalized);
}

export function displayName(p?: Pick<Profile, "full_name" | "email"> | null) {
  if (!p) return "—";
  return p.full_name?.trim() || p.email.split("@")[0];
}

/** Perfil do usuário logado */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

/** Lojas (o admin vê também as inativas) */
export function useStores() {
  return useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });
}

/** Perfis visíveis (admin: todos; vendedor: só o próprio) */
export function useTeam(opts?: { fresh?: boolean }) {
  return useQuery({
    refetchOnMount: opts?.fresh ? "always" : true,
    queryKey: ["team"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name", { nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

export function useLookups() {
  const stores = useStores();
  const team = useTeam();
  const storeName = (id?: string | null) =>
    stores.data?.find((s) => s.id === id)?.name ?? "Sem loja";
  const personName = (id?: string | null) => displayName(team.data?.find((p) => p.id === id));
  return { stores, team, storeName, personName };
}

// ---------------------------------------------------------------------
// Filtro do administrador (loja / vendedor), compartilhado entre telas
// ---------------------------------------------------------------------
export type AdminFilter = { storeId: string; sellerId: string }; // "all" = todos
const FILTER_KEY = "crm_admin_filter_v1";
const defaultFilter: AdminFilter = { storeId: "all", sellerId: "all" };

const FilterContext = createContext<{
  filter: AdminFilter;
  setFilter: (f: AdminFilter) => void;
}>({ filter: defaultFilter, setFilter: () => {} });

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilterState] = useState<AdminFilter>(() => {
    try {
      return { ...defaultFilter, ...JSON.parse(localStorage.getItem(FILTER_KEY) || "{}") };
    } catch {
      return defaultFilter;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filter));
    } catch {
      // sem armazenamento disponível: segue só em memória
    }
  }, [filter]);
  return (
    <FilterContext.Provider value={{ filter, setFilter: setFilterState }}>
      {children}
    </FilterContext.Provider>
  );
}

/** Filtro efetivo: para vendedor sempre "todos" (o banco já restringe aos dados dele). */
export function useAdminFilter() {
  const ctx = useContext(FilterContext);
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  return { ...ctx, isAdmin, effective: isAdmin ? ctx.filter : defaultFilter };
}

// ---------------------------------------------------------------------
// Solicitações de exclusão pendentes de um cliente (chave "tipo:id")
// ---------------------------------------------------------------------
export type DeletableType = "client" | "interaction" | "sale";

export function usePendingDeletions(clientId: string) {
  return useQuery({
    queryKey: ["pendingDeletions", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deletion_requests")
        .select("entity_type, entity_id")
        .eq("client_id", clientId)
        .eq("status", "pending");
      if (error) throw error;
      return new Set((data || []).map((r) => `${r.entity_type}:${r.entity_id}`));
    },
  });
}

/** Quantidade de solicitações aguardando o administrador */
export function usePendingDeletionCount(enabled: boolean) {
  return useQuery({
    queryKey: ["pendingDeletionCount"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("deletion_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// ---------------------------------------------------------------------
// Formas de pagamento (vendas externas)
// ---------------------------------------------------------------------
export const PAYMENT_METHODS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartão" },
  { value: "pix", label: "Pix" },
  { value: "deposito", label: "Depósito em conta" },
  { value: "boleto", label: "Boleto bancário" },
  { value: "pendencia", label: "Pendência" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export function paymentLabel(m: string | null | undefined) {
  return PAYMENT_METHODS.find((p) => p.value === m)?.label ?? "Não informada";
}

// ---------------------------------------------------------------------
// Ficha do cliente (base compartilhada): resumo para todos, completa para quem cadastrou e admin
// ---------------------------------------------------------------------
export type ClientCard = {
  id: string;
  name: string;
  legal_name: string | null;
  person_type: string;
  document: string | null;
  phone: string | null;
  address: string | null;
  contact_person: string | null;
  email: string | null;
  notes: string | null;
  user_id: string;
  store_id: string | null;
  origin_name: string;
  origin_store: string;
  can_edit: boolean;
  created_at: string;
};

export function useClientCard(clientId: string) {
  return useQuery({
    queryKey: ["clientCard", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_card", { p_client_id: clientId });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as ClientCard | null;
    },
  });
}

/** Outro vendedor atendeu este cliente nos últimos 60 dias? (aviso antes de agendar/vender) */
export async function checkAttendance(clientId: string) {
  const { data, error } = await supabase.rpc("client_attendance_check", { p_client_id: clientId });
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

/** Contadores do menu de administração */
export function useOpenAlertsCount(enabled: boolean) {
  return useQuery({
    queryKey: ["openAlertsCount"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("attendance_alerts")
        .select("id", { count: "exact", head: true })
        .is("seen_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
