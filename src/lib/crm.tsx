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
