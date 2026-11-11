import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { z } from "zod";
import { displayName, useLookups, useMe } from "@/lib/crm";
import type { Tables } from "@/integrations/supabase/types";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  company: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  email: z.union([z.string().trim().email("Email inválido").max(255), z.literal("")]),
  address: z.string().trim().max(300),
  notes: z.string().trim().max(2000),
});

const NO_STORE = "none";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Tables<"clients"> | null; // se vier, é edição
  onSaved: (id: string) => void;
};

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: Props) {
  const me = useMe();
  const { stores, team } = useLookups();
  const isAdmin = me.data?.role === "admin";
  const editing = Boolean(client);

  const empty = { name: "", company: "", phone: "", email: "", address: "", notes: "" };
  const [form, setForm] = useState(empty);
  const [sellerId, setSellerId] = useState("");
  const [storeId, setStoreId] = useState(NO_STORE);
  const [saving, setSaving] = useState(false);

  // Preenche o formulário toda vez que abre
  useEffect(() => {
    if (!open) return;
    if (client) {
      setForm({
        name: client.name,
        company: client.company ?? "",
        phone: client.phone ?? "",
        email: client.email ?? "",
        address: client.address ?? "",
        notes: client.notes ?? "",
      });
      setSellerId(client.user_id);
      setStoreId(client.store_id ?? NO_STORE);
    } else {
      setForm(empty);
      setSellerId(me.data?.id ?? "");
      setStoreId(me.data?.store_id ?? NO_STORE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client?.id, me.data?.id]);

  const sellers = (team.data || []).filter((p) => p.active || p.id === sellerId);

  function chooseSeller(id: string) {
    setSellerId(id);
    const sellerStore = team.data?.find((p) => p.id === id)?.store_id;
    if (sellerStore) setStoreId(sellerStore);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = clientSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!sellerId) return toast.error("Escolha o vendedor responsável");
    setSaving(true);
    const payload = {
      name: parsed.data.name,
      company: parsed.data.company || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
      user_id: sellerId,
      store_id: storeId === NO_STORE ? null : storeId,
    };
    const result = client
      ? await supabase.from("clients").update(payload).eq("id", client.id).select("id").single()
      : await supabase.from("clients").insert(payload).select("id").single();
    setSaving(false);
    if (result.error) return toast.error("Não foi possível salvar: " + result.error.message);
    toast.success(editing ? "Cliente atualizado" : "Cliente cadastrado");
    onSaved(result.data.id);
  }

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Altere os dados e salve."
              : "Cadastre os dados básicos. Você pode editar depois."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={set("name")}
              required
              maxLength={120}
              autoFocus
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="company">Empresa</Label>
              <Input id="company" value={form.company} onChange={set("company")} maxLength={120} />
            </div>
            <div>
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                maxLength={40}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={set("email")}
              maxLength={255}
            />
          </div>
          <div>
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" value={form.address} onChange={set("address")} maxLength={300} />
          </div>
          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={set("notes")}
              maxLength={2000}
              rows={3}
            />
          </div>

          {isAdmin && (
            <div className="grid sm:grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
              <div>
                <Label>Vendedor responsável</Label>
                <Select value={sellerId} onValueChange={chooseSeller}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {sellers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {displayName(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Loja</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_STORE}>Sem loja</SelectItem>
                    {(stores.data || []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
