import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Hourglass,
  IdCard,
  Receipt,
  HandCoins,
} from "lucide-react";
import { ClientFormDialog } from "@/components/crm/ClientFormDialog";
import { InteractionDialog } from "@/components/crm/InteractionDialog";
import { SaleDialog } from "@/components/crm/SaleDialog";
import { SettleDialog } from "@/components/crm/SettleDialog";
import { DeleteRequestDialog } from "@/components/crm/DeleteRequestDialog";
import { AttendanceWarning, type AttendanceInfo } from "@/components/crm/AttendanceWarning";
import {
  checkAttendance,
  formatBRL,
  paymentLabel,
  useClientCard,
  useLookups,
  useMe,
  usePendingDeletions,
  type DeletableType,
} from "@/lib/crm";
import { formatDocument } from "@/lib/documents";
import { fmtDate, fmtDateTime } from "@/lib/datetime";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/app/clientes/$id")({
  component: ClientDetail,
});

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

type DeleteTarget = { type: DeletableType; id: string; label: string } | null;
type Pending = { kind: "interaction" | "sale"; info: AttendanceInfo } | null;

function PendingBadge() {
  return (
    <Badge variant="outline" className="border-amber-500 text-amber-700 font-normal">
      <Hourglass className="h-3 w-3 mr-1" />
      Exclusão solicitada
    </Badge>
  );
}

function ClientDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const me = useMe();
  const { personName } = useLookups();
  const card = useClientCard(id);
  const pending = usePendingDeletions(id);
  const isAdmin = me.data?.role === "admin";

  const [editOpen, setEditOpen] = useState(false);
  const [interactionDialog, setInteractionDialog] = useState<{
    open: boolean;
    item: Tables<"interactions"> | null;
  }>({
    open: false,
    item: null,
  });
  const [saleDialog, setSaleDialog] = useState<{ open: boolean; item: Tables<"sales"> | null }>({
    open: false,
    item: null,
  });
  const [settleSale, setSettleSale] = useState<Tables<"sales"> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [warning, setWarning] = useState<Pending>(null);
  const [conflictReason, setConflictReason] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Cada vendedor recebe só os próprios registros (o banco filtra); o admin recebe todos
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

  const isPending = (type: DeletableType, entityId: string) =>
    pending.data?.has(`${type}:${entityId}`) ?? false;

  /** Antes de um novo contato/venda: outro vendedor atendeu nos últimos 60 dias? */
  async function startNew(kind: "interaction" | "sale") {
    setConflictReason(null);
    if (isAdmin) return openNew(kind);
    setChecking(true);
    try {
      const info = await checkAttendance(id);
      if (info) setWarning({ kind, info });
      else openNew(kind);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível verificar o atendimento");
    } finally {
      setChecking(false);
    }
  }
  function openNew(kind: "interaction" | "sale") {
    if (kind === "interaction") setInteractionDialog({ open: true, item: null });
    else setSaleDialog({ open: true, item: null });
  }

  function refreshAll() {
    interactions.refetch();
    sales.refetch();
    card.refetch();
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

  if (card.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (card.error)
    return <p className="text-sm text-destructive">Erro ao carregar: {card.error.message}</p>;
  if (!card.data)
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Cliente não encontrado ou excluído.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/app/clientes">Voltar para clientes</Link>
        </Button>
      </div>
    );

  const c = card.data;
  const canEdit = c.can_edit;
  const wa = c.phone ? whatsappLink(c.phone) : null;
  const totalSold = (sales.data || [])
    .filter((s) => s.payment_method !== "pendencia")
    .reduce((sum, s) => sum + Number(s.amount ?? 0), 0);
  const openPending = (sales.data || []).filter(
    (s) => s.payment_method === "pendencia" && !s.settled_at,
  );
  const clientPending = isPending("client", c.id);

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
          {c.legal_name && c.legal_name !== c.name && (
            <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {c.legal_name}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
            {c.document ? (
              <span className="inline-flex items-center gap-1">
                <IdCard className="h-3 w-3" />
                {c.person_type === "pj" ? "CNPJ" : "CPF"}{" "}
                {formatDocument(c.document, c.person_type)}
              </span>
            ) : (
              c.person_type === "pj" && (
                <Badge variant="outline" className="border-amber-500 text-amber-700 font-normal">
                  Sem CNPJ
                </Badge>
              )
            )}
            {c.contact_person && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                Contato: {c.contact_person}
              </span>
            )}
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
              Cadastrado por {c.origin_name} · {c.origin_store}
            </Badge>
            {totalSold > 0 && (
              <Badge variant="outline" className="font-normal text-emerald-700">
                <DollarSign className="h-3 w-3 mr-1" />
                {formatBRL(totalSold)} em vendas{isAdmin ? "" : " (suas)"}
              </Badge>
            )}
            {openPending.length > 0 && (
              <Badge variant="outline" className="font-normal border-orange-500 text-orange-700">
                <HandCoins className="h-3 w-3 mr-1" />
                {openPending.length} pendência(s) em aberto
              </Badge>
            )}
            {clientPending && <PendingBadge />}
          </div>
        </div>
        {canEdit && (
          <div className="flex shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} aria-label="Editar">
              <Pencil className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Editar</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              aria-label="Excluir"
              disabled={clientPending}
              onClick={() =>
                setDeleteTarget({ type: "client", id: c.id, label: `o cliente "${c.name}"` })
              }
            >
              <Trash2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{clientPending ? "Aguardando" : "Excluir"}</span>
            </Button>
          </div>
        )}
      </div>

      {c.notes && (
        <Card>
          <CardContent className="p-4 text-sm flex gap-2">
            <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <span className="whitespace-pre-wrap">{c.notes}</span>
          </CardContent>
        </Card>
      )}

      {/* Visitas e agendamentos */}
      <Card>
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">Visitas e contatos</CardTitle>
            <CardDescription>
              {isAdmin ? "Registros de todos os vendedores" : "Seus registros com este cliente"}
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => startNew("interaction")}
            disabled={checking}
          >
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {interactions.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
          )}
          {interactions.data?.map((i) => {
            const itemPending = isPending("interaction", i.id);
            const label = `a ${(TYPE_LABEL[i.type] ?? "contato").toLowerCase()} de ${fmtDateTime(i.happened_at)}`;
            const mine = i.user_id === me.data?.id;
            return (
              <div key={i.id} className="border rounded-lg p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{TYPE_LABEL[i.type] ?? i.type}</Badge>
                  <span className="text-sm font-medium">{fmtDateTime(i.happened_at)}</span>
                  {i.contact_person && (
                    <span className="text-xs text-muted-foreground truncate">
                      com {i.contact_person}
                    </span>
                  )}
                  {isAdmin && (
                    <span className="text-xs text-muted-foreground">· {personName(i.user_id)}</span>
                  )}
                  {itemPending && <PendingBadge />}
                  {(mine || isAdmin) && (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => setInteractionDialog({ open: true, item: i })}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Editar registro"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: "interaction", id: i.id, label })}
                        disabled={itemPending}
                        className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                        aria-label="Excluir registro"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                {i.notes && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{i.notes}</p>
                )}
                {i.follow_up_at && (
                  <div className="flex items-center gap-2 pt-1">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">
                      Retornar em <strong>{fmtDateTime(i.follow_up_at)}</strong>
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
            );
          })}
        </CardContent>
      </Card>

      {/* Vendas */}
      <Card>
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">Vendas</CardTitle>
            <CardDescription>
              {isAdmin ? "Vendas de todos os vendedores." : "Suas vendas para este cliente."}{" "}
              Pendências são quitadas com NF.
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => startNew("sale")}
            disabled={checking}
          >
            <DollarSign className="h-4 w-4 mr-1" /> Vendi
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {sales.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem vendas registradas.</p>
          )}
          {sales.data?.map((s) => {
            const itemPending = isPending("sale", s.id);
            const label = `a venda de ${formatBRL(s.amount) || "valor não informado"} (${fmtDate(s.sold_at)})`;
            const mine = s.user_id === me.data?.id;
            const isPend = s.payment_method === "pendencia";
            const isSettlement = Boolean(s.settles_sale_id);
            return (
              <div
                key={s.id}
                className={`border rounded-lg p-3 space-y-1 ${isPend && !s.settled_at ? "border-orange-300" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {isPend ? (
                    <Badge
                      className={
                        s.settled_at
                          ? "bg-slate-400 hover:bg-slate-400"
                          : "bg-orange-500 hover:bg-orange-500"
                      }
                    >
                      <HandCoins className="h-3 w-3 mr-1" />
                      {s.settled_at ? "Pendência quitada" : "Pendência"}
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">
                      <DollarSign className="h-3 w-3 mr-1" />
                      {isSettlement ? "Quitação" : "Venda"}
                    </Badge>
                  )}
                  <span className="text-sm font-medium">{fmtDate(s.sold_at)}</span>
                  {s.amount != null && <span className="text-sm">{formatBRL(s.amount)}</span>}
                  <Badge variant="outline" className="font-normal">
                    {paymentLabel(s.payment_method)}
                  </Badge>
                  {s.nf_number && (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Receipt className="h-3 w-3" />
                      NF {s.nf_number}
                      {s.nf_date && ` de ${fmtDate(s.nf_date + "T12:00:00")}`}
                    </span>
                  )}
                  {isAdmin && (
                    <span className="text-xs text-muted-foreground">· {personName(s.user_id)}</span>
                  )}
                  {itemPending && <PendingBadge />}
                  {(mine || isAdmin) && (
                    <div className="ml-auto flex items-center gap-1">
                      {isPend && !s.settled_at && (
                        <Button
                          size="sm"
                          className="h-7 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => setSettleSale(s)}
                        >
                          Quitar
                        </Button>
                      )}
                      <button
                        onClick={() => setSaleDialog({ open: true, item: s })}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Editar venda"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: "sale", id: s.id, label })}
                        disabled={itemPending}
                        className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                        aria-label="Excluir venda"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                {s.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {s.description}
                  </p>
                )}
                {!isSettlement && (
                  <div className="flex items-center gap-2 pt-1">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">
                      Pós-venda em <strong>{fmtDateTime(s.post_sale_due_at)}</strong>
                      <span className="text-muted-foreground">
                        {" "}
                        ({s.post_sale_manual ? "data escolhida" : "automático"})
                      </span>
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
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {canEdit && (
        <ClientFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          client={c}
          onSaved={() => {
            setEditOpen(false);
            card.refetch();
          }}
        />
      )}
      <AttendanceWarning
        info={warning?.info ?? null}
        action={warning?.kind === "sale" ? "venda" : "contato"}
        open={Boolean(warning)}
        onCancel={() => setWarning(null)}
        onConfirm={(reason) => {
          const kind = warning!.kind;
          setConflictReason(reason);
          setWarning(null);
          openNew(kind);
        }}
      />
      <InteractionDialog
        clientId={id}
        interaction={interactionDialog.item}
        open={interactionDialog.open}
        onOpenChange={(open) => setInteractionDialog((s) => ({ ...s, open }))}
        onSaved={refreshAll}
        conflictReason={conflictReason}
      />
      <SaleDialog
        clientId={id}
        sale={saleDialog.item}
        open={saleDialog.open}
        onOpenChange={(open) => setSaleDialog((s) => ({ ...s, open }))}
        onSaved={refreshAll}
        conflictReason={conflictReason}
      />
      <SettleDialog
        sale={settleSale}
        open={Boolean(settleSale)}
        onOpenChange={(open) => !open && setSettleSale(null)}
        onSettled={() => sales.refetch()}
      />
      {deleteTarget && (
        <DeleteRequestDialog
          entityType={deleteTarget.type}
          entityId={deleteTarget.id}
          label={deleteTarget.label}
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onRequested={() => pending.refetch()}
          onDeleted={() => {
            if (deleteTarget.type === "client") router.navigate({ to: "/app/clientes" });
            else if (deleteTarget.type === "interaction") interactions.refetch();
            else sales.refetch();
          }}
        />
      )}
    </div>
  );
}
