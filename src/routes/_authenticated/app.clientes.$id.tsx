import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  MapPin,
  Plus,
  DollarSign,
  CalendarClock,
  CheckCircle2,
  Trash2,
  FileText,
  Pencil,
  MessageCircle,
  Store as StoreIcon,
  User,
} from "lucide-react";
import { ClientFormDialog } from "@/components/crm/ClientFormDialog";
import { formatBRL, parseBRL, useLookups, useMe } from "@/lib/crm";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/app/clientes/$id")({
  component: ClientDetail,
});

const interactionSchema = z.object({
  type: z.enum(["visita", "ligacao", "reuniao", "outro"]),
  happened_at: z.string().min(1, "Informe data e hora"),
  contact_person: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  follow_up_at: z.string().optional().or(z.literal("")),
});

const saleSchema = z.object({
  sold_at: z.string().min(1, "Informe data da venda"),
  amount: z.string().optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

function toLocalInput(d?: Date) {
  const dt = d ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const TYPE_LABEL: Record<string, string> = {
  visita: "Visita",
  ligacao: "Ligação",
  reuniao: "Reunião",
  outro: "Outro",
};

function whatsappLink(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  return digits.length >= 12 ? `https://wa.me/${digits}` : null;
}

function ClientDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const me = useMe();
  const { storeName, personName } = useLookups();
  const [editOpen, setEditOpen] = useState(false);
  const isAdmin = me.data?.role === "admin";

  const client = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const interactions = useQuery({
    queryKey: ["interactions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interactions")
        .select("*")
        .eq("client_id", id)
        .order("happened_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const sales = useQuery({
    queryKey: ["sales", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("client_id", id)
        .order("sold_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  async function deleteClient() {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cliente excluído");
    router.navigate({ to: "/app/clientes" });
  }

  async function deleteInteraction(interactionId: string) {
    if (!window.confirm("Excluir este registro?")) return;
    const { error } = await supabase.from("interactions").delete().eq("id", interactionId);
    if (error) return toast.error(error.message);
    toast.success("Registro excluído");
    interactions.refetch();
  }

  async function deleteSale(saleId: string) {
    if (!window.confirm("Excluir esta venda?")) return;
    const { error } = await supabase.from("sales").delete().eq("id", saleId);
    if (error) return toast.error(error.message);
    toast.success("Venda excluída");
    sales.refetch();
  }

  async function toggleFollowUp(interactionId: string, done: boolean) {
    const { error } = await supabase
      .from("interactions")
      .update({ follow_up_done: done })
      .eq("id", interactionId);
    if (error) return toast.error(error.message);
    interactions.refetch();
  }

  async function togglePostSale(saleId: string, done: boolean) {
    const { error } = await supabase
      .from("sales")
      .update({ post_sale_done_at: done ? new Date().toISOString() : null })
      .eq("id", saleId);
    if (error) return toast.error(error.message);
    sales.refetch();
  }

  if (client.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (client.error)
    return <p className="text-sm text-destructive">Erro ao carregar: {client.error.message}</p>;
  if (!client.data)
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Cliente não encontrado ou sem permissão de acesso.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/app/clientes">Voltar para clientes</Link>
        </Button>
      </div>
    );

  const c = client.data;
  const wa = c.phone ? whatsappLink(c.phone) : null;
  const totalSold = (sales.data || []).reduce((sum, s) => sum + Number(s.amount ?? 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/app/clientes">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{c.name}</h1>
          {c.company && (
            <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {c.company}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:underline">
                <Phone className="h-3 w-3" />
                {c.phone}
              </a>
            )}
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
              >
                <MessageCircle className="h-3 w-3" />
                WhatsApp
              </a>
            )}
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className="inline-flex items-center gap-1 hover:underline"
              >
                <Mail className="h-3 w-3" />
                {c.email}
              </a>
            )}
            {c.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
              >
                <MapPin className="h-3 w-3" />
                {c.address}
              </a>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            <Badge variant="outline" className="font-normal">
              <StoreIcon className="h-3 w-3 mr-1" />
              {storeName(c.store_id)}
            </Badge>
            {isAdmin && (
              <Badge variant="outline" className="font-normal">
                <User className="h-3 w-3 mr-1" />
                {personName(c.user_id)}
              </Badge>
            )}
            {totalSold > 0 && (
              <Badge variant="outline" className="font-normal text-emerald-700">
                <DollarSign className="h-3 w-3 mr-1" />
                {formatBRL(totalSold)} em vendas
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} aria-label="Editar">
            <Pencil className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Editar</span>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-destructive hover:text-destructive"
                aria-label="Excluir"
              >
                <Trash2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Excluir</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                <AlertDialogDescription>
                  Todas as interações e vendas deste cliente também serão removidas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteClient}
                  className="bg-destructive text-destructive-foreground"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {c.notes && (
        <Card>
          <CardContent className="p-4 text-sm flex gap-2">
            <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <span className="whitespace-pre-wrap">{c.notes}</span>
          </CardContent>
        </Card>
      )}

      {/* Interações */}
      <Card>
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">Visitas e contatos</CardTitle>
            <CardDescription>Registre cada visita, ligação ou reunião</CardDescription>
          </div>
          <NewInteractionDialog clientId={id} onCreated={() => interactions.refetch()} />
        </CardHeader>
        <CardContent className="space-y-2">
          {interactions.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
          )}
          {interactions.data?.map((i) => (
            <div key={i.id} className="border rounded-lg p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{TYPE_LABEL[i.type] ?? i.type}</Badge>
                <span className="text-sm font-medium">
                  {format(new Date(i.happened_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
                {i.contact_person && (
                  <span className="text-xs text-muted-foreground truncate">
                    com {i.contact_person}
                  </span>
                )}
                <button
                  onClick={() => deleteInteraction(i.id)}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  aria-label="Excluir registro"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {i.notes && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{i.notes}</p>
              )}
              {i.follow_up_at && (
                <div className="flex items-center gap-2 pt-1">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">
                    Retornar em{" "}
                    <strong>
                      {format(new Date(i.follow_up_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </strong>
                  </span>
                  <Button
                    size="sm"
                    variant={i.follow_up_done ? "secondary" : "outline"}
                    className="ml-auto h-7"
                    onClick={() => toggleFollowUp(i.id, !i.follow_up_done)}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {i.follow_up_done ? "Feito" : "Marcar feito"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Vendas */}
      <Card>
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">Vendas</CardTitle>
            <CardDescription>
              Registre quando vender. Um lembrete de pós-venda aparece em 3 dias.
            </CardDescription>
          </div>
          <NewSaleDialog clientId={id} onCreated={() => sales.refetch()} />
        </CardHeader>
        <CardContent className="space-y-2">
          {sales.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem vendas registradas.</p>
          )}
          {sales.data?.map((s) => (
            <div key={s.id} className="border rounded-lg p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-600 hover:bg-emerald-600">
                  <DollarSign className="h-3 w-3 mr-1" />
                  Venda
                </Badge>
                <span className="text-sm font-medium">
                  {format(new Date(s.sold_at), "dd/MM/yyyy", { locale: ptBR })}
                </span>
                {s.amount != null && <span className="text-sm">{formatBRL(s.amount)}</span>}
                <button
                  onClick={() => deleteSale(s.id)}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  aria-label="Excluir venda"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {s.description && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.description}</p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs">
                  Pós-venda em{" "}
                  <strong>
                    {format(new Date(s.post_sale_due_at), "dd/MM/yyyy", { locale: ptBR })}
                  </strong>
                </span>
                <Button
                  size="sm"
                  variant={s.post_sale_done_at ? "secondary" : "outline"}
                  className="ml-auto h-7"
                  onClick={() => togglePostSale(s.id, !s.post_sale_done_at)}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {s.post_sale_done_at ? "Feito" : "Marcar feito"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <ClientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        client={c}
        onSaved={() => {
          setEditOpen(false);
          client.refetch();
        }}
      />
    </div>
  );
}

function NewInteractionDialog({
  clientId,
  onCreated,
}: {
  clientId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: "visita" as "visita" | "ligacao" | "reuniao" | "outro",
    happened_at: toLocalInput(),
    contact_person: "",
    notes: "",
    follow_up_at: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = interactionSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaving(false);
      return toast.error("Sessão expirada");
    }
    const { error } = await supabase.from("interactions").insert({
      user_id: userData.user.id,
      client_id: clientId,
      type: parsed.data.type,
      happened_at: new Date(parsed.data.happened_at).toISOString(),
      contact_person: parsed.data.contact_person || null,
      notes: parsed.data.notes || null,
      follow_up_at: parsed.data.follow_up_at
        ? new Date(parsed.data.follow_up_at).toISOString()
        : null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Registro salvo");
    setForm({
      ...form,
      contact_person: "",
      notes: "",
      follow_up_at: "",
      happened_at: toLocalInput(),
    });
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Novo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar visita/contato</DialogTitle>
          <DialogDescription>Anote o que foi conversado e quando retornar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as typeof form.type })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visita">Visita</SelectItem>
                  <SelectItem value="ligacao">Ligação</SelectItem>
                  <SelectItem value="reuniao">Reunião</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="happened">Data e hora *</Label>
              <Input
                id="happened"
                type="datetime-local"
                value={form.happened_at}
                onChange={(e) => setForm({ ...form, happened_at: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="cp">Com quem falou</Label>
            <Input
              id="cp"
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
              placeholder="Nome / cargo"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="notes">O que foi conversado</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              maxLength={2000}
            />
          </div>
          <div>
            <Label htmlFor="fu">Próximo retorno / visita</Label>
            <Input
              id="fu"
              type="datetime-local"
              value={form.follow_up_at}
              onChange={(e) => setForm({ ...form, follow_up_at: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Opcional. Aparece como pendência no painel.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewSaleDialog({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sold_at: toLocalInput(), amount: "", description: "" });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = saleSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaving(false);
      return toast.error("Sessão expirada");
    }
    const soldAt = new Date(parsed.data.sold_at);
    const postSaleDue = new Date(soldAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    const amountNum = parsed.data.amount ? parseBRL(parsed.data.amount) : null;
    if (parsed.data.amount && (amountNum === null || Number.isNaN(amountNum) || amountNum < 0)) {
      setSaving(false);
      return toast.error("Valor inválido");
    }
    const { error } = await supabase.from("sales").insert({
      user_id: userData.user.id,
      client_id: clientId,
      sold_at: soldAt.toISOString(),
      amount: amountNum,
      description: parsed.data.description || null,
      post_sale_due_at: postSaleDue.toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Venda registrada — lembrete de pós-venda em 3 dias");
    setOpen(false);
    setForm({ sold_at: toLocalInput(), amount: "", description: "" });
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="default"
          className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
        >
          <DollarSign className="h-4 w-4 mr-1" /> Vendi
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar venda</DialogTitle>
          <DialogDescription>
            Em 3 dias você receberá um lembrete para o pós-venda.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sold">Data da venda *</Label>
              <Input
                id="sold"
                type="datetime-local"
                value={form.sold_at}
                onChange={(e) => setForm({ ...form, sold_at: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0,00"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="desc">Descrição</Label>
            <Textarea
              id="desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              maxLength={2000}
              placeholder="Produtos, condições, observações..."
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Salvando…" : "Registrar venda"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
