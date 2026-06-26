import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, ChevronRight, Building2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/app/clientes")({
  head: () => ({ meta: [{ title: "Clientes | Vendas CRM" }] }),
  component: ClientsPage,
});

const clientSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Email inválido").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function ClientsPage() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, company, phone, email")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = (clients.data || []).filter((c) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [c.name, c.company, c.phone, c.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clients.data?.length ?? 0} cadastrados</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0"><Plus className="h-4 w-4 mr-2" /> Novo</Button>
          </DialogTrigger>
          <NewClientDialog onCreated={() => { setOpen(false); clients.refetch(); }} />
        </Dialog>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, empresa, telefone ou email" className="pl-9" />
      </div>

      {clients.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!clients.isLoading && filtered.length === 0 && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          {clients.data?.length === 0 ? "Cadastre seu primeiro cliente para começar." : "Nenhum cliente encontrado."}
        </CardContent></Card>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((c) => (
          <Link
            key={c.id}
            to="/app/clientes/$id"
            params={{ id: c.id }}
            className="group block"
          >
            <Card className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  {c.company && <div className="text-xs text-muted-foreground truncate flex items-center gap-1"><Building2 className="h-3 w-3" />{c.company}</div>}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                    {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                    {c.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{c.email}</span>}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 group-hover:text-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NewClientDialog({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", company: "", phone: "", email: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = clientSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setSaving(false); return toast.error("Sessão expirada"); }
    const payload = {
      user_id: userData.user.id,
      name: parsed.data.name,
      company: parsed.data.company || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    };
    const { error } = await supabase.from("clients").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cliente cadastrado");
    onCreated();
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Novo cliente</DialogTitle>
        <DialogDescription>Cadastre os dados básicos. Você pode editar depois.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="name">Nome *</Label>
          <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="company">Empresa</Label>
            <Input id="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} />
          </div>
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
        </div>
        <div>
          <Label htmlFor="address">Endereço</Label>
          <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={300} />
        </div>
        <div>
          <Label htmlFor="notes">Observações</Label>
          <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} rows={3} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Cadastrar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
