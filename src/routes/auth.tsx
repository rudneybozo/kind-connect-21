import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast, Toaster } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | Vendas CRM" },
      { name: "description", content: "Acesse seu CRM para gerenciar clientes, visitas, retornos e pós-venda." },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

function AuthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.navigate({ to: "/app", replace: true });
    });
  }, [router]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      const message = error.message.toLowerCase().includes("invalid login credentials")
        ? "Não foi possível entrar. Verifique se o email está cadastrado, se a senha está correta ou se a conta já foi confirmada."
        : error.message;
      return toast.error(message);
    }
    if (!data.session) {
      return toast.error("Login não concluído. Confirme seu email e tente novamente.");
    }
    router.navigate({ to: "/app", replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      ...parsed.data,
      options: { emailRedirectTo: window.location.origin + "/app" },
    });
    setLoading(false);
    if (error) {
      if (error.message.toLowerCase().includes("registered")) {
        return toast.error("Este email já está cadastrado");
      }
      return toast.error(error.message);
    }
    toast.success("Conta criada! Se necessário, confirme seu email antes de entrar.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl mb-3">V</div>
          <h1 className="text-2xl font-bold">Vendas CRM</h1>
          <p className="text-sm text-muted-foreground">Seu acompanhamento de clientes e vendas.</p>
        </div>
        <Card>
          <Tabs defaultValue="signin">
            <CardHeader>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="signin" className="mt-0">
                <CardTitle className="mb-1 text-lg">Bem-vindo de volta</CardTitle>
                <CardDescription className="mb-4">Acesse sua conta de vendedor</CardDescription>
                <form onSubmit={handleSignIn} className="space-y-3">
                  <div>
                    <Label htmlFor="email-in">Email</Label>
                    <Input id="email-in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                  </div>
                  <div>
                    <Label htmlFor="pw-in">Senha</Label>
                    <Input id="pw-in" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">{loading ? "Entrando..." : "Entrar"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="mt-0">
                <CardTitle className="mb-1 text-lg">Crie sua conta</CardTitle>
                <CardDescription className="mb-4">Cada vendedor vê apenas seus próprios clientes.</CardDescription>
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div>
                    <Label htmlFor="email-up">Email</Label>
                    <Input id="email-up" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                  </div>
                  <div>
                    <Label htmlFor="pw-up">Senha</Label>
                    <Input id="pw-up" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                    <p className="text-xs text-muted-foreground mt-1">Mínimo 6 caracteres.</p>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">{loading ? "Criando..." : "Criar conta"}</Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-4">
          <Link to="/" className="hover:underline">Voltar ao início</Link>
        </p>
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
}
