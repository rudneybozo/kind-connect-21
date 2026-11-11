import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock, Plus, Save, Trash2, UserCog, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { displayName, useMe, useStores, useTeam, type Profile, type Store } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/app/equipe")({
  beforeLoad: async () => {
    const { data } = await supabase.rpc("is_admin");
    if (!data) throw redirect({ to: "/app" });
  },
  component: TeamPage,
});

const NO_STORE = "none";

function TeamPage() {
  const team = useTeam({ fresh: true });
  const stores = useStores();
  const pending = (team.data || []).filter((p) => !p.active);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Equipe e lojas</h1>
        <p className="text-sm text-muted-foreground">
          Libere vendedores, defina a loja de cada um e gerencie as lojas.
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">
            Usuários
            {pending.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="stores">Lojas</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-3 mt-4">
          {team.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {team.error && <p className="text-sm text-destructive">Erro: {team.error.message}</p>}
          {pending.length > 0 && (
            <p className="text-sm flex items-center gap-2 text-amber-700">
              <Clock className="h-4 w-4" /> {pending.length} pessoa(s) aguardando liberação.
            </p>
          )}
          {[...pending, ...(team.data || []).filter((p) => p.active)].map((p) => (
            <UserRow key={p.id} profile={p} stores={stores.data || []} team={team.data || []} />
          ))}
          <p className="text-xs text-muted-foreground">
            Novos vendedores se cadastram na tela de login, em “Criar conta”, e aparecem aqui para
            você liberar.
          </p>
        </TabsContent>

        <TabsContent value="stores" className="mt-4">
          <StoresPanel stores={stores.data || []} team={team.data || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserRow({
  profile,
  stores,
  team,
}: {
  profile: Profile;
  stores: Store[];
  team: Profile[];
}) {
  const qc = useQueryClient();
  const me = useMe();
  const isMe = me.data?.id === profile.id;
  const [name, setName] = useState(profile.full_name ?? "");
  const [role, setRole] = useState(profile.role);
  const [storeId, setStoreId] = useState(profile.store_id ?? NO_STORE);
  const [active, setActive] = useState(profile.active);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    setName(profile.full_name ?? "");
    setRole(profile.role);
    setStoreId(profile.store_id ?? NO_STORE);
    setActive(profile.active);
  }, [profile]);

  const dirty =
    name !== (profile.full_name ?? "") ||
    role !== profile.role ||
    storeId !== (profile.store_id ?? NO_STORE) ||
    active !== profile.active;

  async function save(overrides?: { active?: boolean }) {
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_user", {
      p_user_id: profile.id,
      p_role: role,
      p_store_id: storeId === NO_STORE ? null : storeId,
      p_active: overrides?.active ?? active,
      p_full_name: name,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Usuário atualizado");
    qc.invalidateQueries({ queryKey: ["team"] });
    if (isMe) qc.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <Card className={!profile.active ? "border-amber-400" : undefined}>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <UserCog className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{displayName(profile)}</span>
          <span className="text-xs text-muted-foreground break-all">{profile.email}</span>
          {isMe && <Badge variant="secondary">Você</Badge>}
          {!profile.active && (
            <Badge className="bg-amber-500 hover:bg-amber-500">Aguardando liberação</Badge>
          )}
        </div>

        <div className="grid sm:grid-cols-[1.3fr_1fr_1fr_auto] gap-3 items-end">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Nome do vendedor"
            />
          </div>
          <div>
            <Label className="text-xs">Loja</Label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_STORE}>Sem loja</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Papel</Label>
            <Select value={role} onValueChange={setRole} disabled={isMe}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vendedor">Vendedor</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 h-9">
            <Switch
              id={`active-${profile.id}`}
              checked={active}
              onCheckedChange={setActive}
              disabled={isMe}
            />
            <Label htmlFor={`active-${profile.id}`} className="text-sm">
              Liberado
            </Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          {!profile.active && !dirty && (
            <Button
              size="sm"
              onClick={() => save({ active: true })}
              disabled={saving || storeId === NO_STORE}
            >
              {storeId === NO_STORE ? "Escolha a loja para liberar" : "Liberar acesso"}
            </Button>
          )}
          {dirty && (
            <Button size="sm" onClick={() => save()} disabled={saving}>
              <Save className="h-4 w-4 mr-2" /> {saving ? "Salvando…" : "Salvar"}
            </Button>
          )}
          {!isMe && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </Button>
          )}
        </div>
      </CardContent>
      <DeleteUserDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        profile={profile}
        team={team}
      />
    </Card>
  );
}

function DeleteUserDialog({
  open,
  onOpenChange,
  profile,
  team,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profile: Profile;
  team: Profile[];
}) {
  const qc = useQueryClient();
  const others = team.filter((p) => p.id !== profile.id && p.active);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    if (target) {
      const { data, error } = await supabase.rpc("admin_transfer_clients", {
        p_from: profile.id,
        p_to: target,
      });
      if (error) {
        setBusy(false);
        return toast.error("Falha ao transferir clientes: " + error.message);
      }
      toast.success(`${data ?? 0} cliente(s) transferido(s)`);
    }
    const { error } = await supabase.rpc("admin_delete_user", { p_user_id: profile.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Usuário excluído");
    onOpenChange(false);
    qc.invalidateQueries();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir {displayName(profile)}?</DialogTitle>
          <DialogDescription>
            A conta será apagada. Os clientes dele também serão apagados, a menos que você os
            transfira para outra pessoa.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>Transferir os clientes para</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Não transferir (apagar os clientes)" />
            </SelectTrigger>
            <SelectContent>
              {others.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {displayName(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={run} disabled={busy}>
            {busy ? "Excluindo…" : target ? "Transferir e excluir" : "Excluir tudo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StoresPanel({ stores, team }: { stores: Store[]; team: Profile[] }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  async function addStore(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.from("stores").insert({ name });
    setBusy(false);
    if (error)
      return toast.error(
        error.code === "23505" ? "Já existe uma loja com esse nome" : error.message,
      );
    setNewName("");
    toast.success("Loja criada");
    qc.invalidateQueries({ queryKey: ["stores"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <StoreIcon className="h-5 w-5" /> Lojas
        </CardTitle>
        <CardDescription>
          Lojas desativadas somem do cadastro de novos vendedores, mas o histórico continua.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {stores.map((s) => (
          <StoreRow key={s.id} store={s} people={team.filter((p) => p.store_id === s.id).length} />
        ))}
        <form onSubmit={addStore} className="flex gap-2 pt-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome da nova loja"
            maxLength={80}
          />
          <Button type="submit" disabled={busy || !newName.trim()}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StoreRow({ store, people }: { store: Store; people: number }) {
  const qc = useQueryClient();
  const [name, setName] = useState(store.name);
  const [busy, setBusy] = useState(false);

  async function update(values: { name?: string; active?: boolean }) {
    setBusy(true);
    const { error } = await supabase.from("stores").update(values).eq("id", store.id);
    setBusy(false);
    if (error)
      return toast.error(
        error.code === "23505" ? "Já existe uma loja com esse nome" : error.message,
      );
    toast.success("Loja atualizada");
    qc.invalidateQueries({ queryKey: ["stores"] });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border rounded-lg p-3">
      <div className="flex gap-2 min-w-0">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        {name.trim() && name.trim() !== store.name && (
          <Button size="sm" onClick={() => update({ name: name.trim() })} disabled={busy}>
            <Save className="h-4 w-4" />
          </Button>
        )}
      </div>
      <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">
        {people} pessoa(s)
      </span>
      <div className="flex items-center gap-2">
        <Switch
          id={`store-${store.id}`}
          checked={store.active}
          onCheckedChange={(v) => update({ active: v })}
          disabled={busy}
        />
        <Label htmlFor={`store-${store.id}`} className="text-sm">
          {store.active ? "Ativa" : "Inativa"}
        </Label>
      </div>
    </div>
  );
}
