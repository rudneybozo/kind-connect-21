import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { z } from "zod";
import { useStores } from "@/lib/crm";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const loginSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "A senha precisa ter no mínimo 6 caracteres").max(72),
});

const signupSchema = loginSchema.extend({
  full_name: z.string().trim().min(2, "Informe seu nome").max(120),
  store_id: z.string().min(1, "Escolha sua loja"),
});

function translateAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email ou senha incorretos.";
  if (m.includes("email not confirmed"))
    return "Confirme seu email antes de entrar (veja sua caixa de entrada e o spam).";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Este email já está cadastrado. Use a aba Entrar.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (m.includes("password")) return "Senha inválida. Use no mínimo 6 caracteres.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Sem conexão com o servidor. Verifique a internet.";
  return message;
}

function AuthPage() {
  const router = useRouter();
  const stores = useStores();
  const [tab, setTab] = useState("signin");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [storeId, setStoreId] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.navigate({ to: "/app", replace: true });
    });
  }, [router]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) return toast.error(translateAuthError(error.message));
    if (!data.session)
      return toast.error("Login não concluído. Confirme seu email e tente de novo.");
    router.navigate({ to: "/app", replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signupSchema.safeParse({
      email,
      password,
      full_name: fullName,
      store_id: storeId,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin + "/app",
        data: { full_name: parsed.data.full_name, store_id: parsed.data.store_id },
      },
    });
    setLoading(false);
    if (error) return toast.error(translateAuthError(error.message));
    if (data.session) {
      router.navigate({ to: "/app", replace: true });
      return;
    }
    toast.success("Conta criada! Confirme seu email pelo link que enviamos e depois entre.");
    setTab("signin");
  }

  async function handleForgot() {
    const parsed = loginSchema.shape.email.safeParse(email);
    if (!parsed.success) return toast.error("Digite seu email no campo acima primeiro.");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: window.location.origin + "/redefinir-senha",
    });
    setLoading(false);
    if (error) return toast.error(translateAuthError(error.message));
    toast.success("Enviamos um link para criar uma nova senha. Veja seu email.");
  }

  const activeStores = (stores.data || []).filter((s) => s.active);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl mb-3">
            V
          </div>
          <h1 className="text-2xl font-bold">Vendas CRM</h1>
          <p className="text-sm text-muted-foreground">Incoplim · Bem Limp · Cometa</p>
        </div>
        <Card>
          <Tabs value={tab} onValueChange={setTab}>
            <CardHeader>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="signin" className="mt-0">
                <CardTitle className="mb-1 text-lg">Bem-vindo de volta</CardTitle>
                <CardDescription className="mb-4">Acesse sua conta</CardDescription>
                <form onSubmit={handleSignIn} className="space-y-3">
                  <div>
                    <Label htmlFor="email-in">Email</Label>
                    <Input
                      id="email-in"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pw-in">Senha</Label>
                    <Input
                      id="pw-in"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                  <button
                    type="button"
                    onClick={handleForgot}
                    disabled={loading}
                    className="w-full text-center text-xs text-muted-foreground hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="mt-0">
                <CardTitle className="mb-1 text-lg">Crie sua conta</CardTitle>
                <CardDescription className="mb-4">
                  Depois do cadastro, o administrador libera seu acesso.
                </CardDescription>
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div>
                    <Label htmlFor="name-up">Seu nome</Label>
                    <Input
                      id="name-up"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <Label>Sua loja</Label>
                    <Select value={storeId} onValueChange={setStoreId}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={stores.isLoading ? "Carregando…" : "Escolha a loja"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {activeStores.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="email-up">Email</Label>
                    <Input
                      id="email-up"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pw-up">Senha</Label>
                    <Input
                      id="pw-up"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Mínimo 6 caracteres.</p>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Criando..." : "Criar conta"}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
