import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/redefinir-senha")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  // O link do email abre esta página já com uma sessão temporária
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setReady(Boolean(session)),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("A senha precisa ter no mínimo 6 caracteres");
    if (password !== confirm) return toast.error("As senhas não conferem");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Senha alterada!");
    router.navigate({ to: "/app", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary px-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-4">
          <div>
            <CardTitle className="text-lg">Criar nova senha</CardTitle>
            <CardDescription>
              {ready
                ? "Digite a nova senha duas vezes."
                : "Abra esta página pelo link enviado ao seu email."}
            </CardDescription>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="pw1">Nova senha</Label>
              <Input
                id="pw1"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!ready}
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="pw2">Repita a senha</Label>
              <Input
                id="pw2"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={!ready}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={!ready || saving}>
              {saving ? "Salvando…" : "Salvar nova senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
