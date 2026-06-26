import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Vendas CRM" },
      { name: "description", content: "CRM simples para vendedores: clientes, visitas, retornos e pós-venda." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/app" });
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});
