import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Loader2, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { displayName, useLookups, useMe, type ClientCard } from "@/lib/crm";
import {
  formatCNPJ,
  formatCPF,
  isValidCNPJ,
  isValidCPF,
  lookupCNPJ,
  onlyDigits,
} from "@/lib/documents";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120),
  legal_name: z.string().trim().max(160),
  contact_person: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  email: z.union([z.string().trim().email("Email inválido").max(255), z.literal("")]),
  address: z.string().trim().max(300),
  notes: z.string().trim().max(2000),
});

const NO_STORE = "none";

type Duplicate = {
  id: string;
  name: string;
  match: string;
  origin_name: string;
  origin_store: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: ClientCard | null; // se vier, é edição (só quem cadastrou ou admin)
  onSaved: (id: string) => void;
};

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: Props) {
  const me = useMe();
  const { stores, team } = useLookups();
  const isAdmin = me.data?.role === "admin";
  const editing = Boolean(client);

  const empty = {
    name: "",
    legal_name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  };
  const [personType, setPersonType] = useState<"pj" | "pf">("pj");
  const [doc, setDoc] = useState("");
  const [form, setForm] = useState(empty);
  const [sellerId, setSellerId] = useState("");
  const [storeId, setStoreId] = useState(NO_STORE);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [docDuplicate, setDocDuplicate] = useState<Duplicate | null>(null);
  const [phoneDuplicate, setPhoneDuplicate] = useState<Duplicate | null>(null);
  const lastLookup = useRef("");

  useEffect(() => {
    if (!open) return;
    setDocDuplicate(null);
    setPhoneDuplicate(null);
    lastLookup.current = "";
    if (client) {
      setPersonType(client.person_type === "pf" ? "pf" : "pj");
      setDoc(client.document ?? "");
      setForm({
        name: client.name,
        legal_name: client.legal_name ?? "",
        contact_person: client.contact_person ?? "",
        phone: client.phone ?? "",
        email: client.email ?? "",
        address: client.address ?? "",
        notes: client.notes ?? "",
      });
      setSellerId(client.user_id);
      setStoreId(client.store_id ?? NO_STORE);
    } else {
      setPersonType("pj");
      setDoc("");
      setForm(empty);
      setSellerId(me.data?.id ?? "");
      setStoreId(me.data?.store_id ?? NO_STORE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client?.id, me.data?.id]);

  const docDigits = onlyDigits(doc);
  const docComplete = personType === "pj" ? docDigits.length === 14 : docDigits.length === 11;
  const docValid = personType === "pj" ? isValidCNPJ(docDigits) : isValidCPF(docDigits);
  const docError =
    docComplete && !docValid ? (personType === "pj" ? "CNPJ inválido" : "CPF inválido") : null;

  async function findDuplicates(document: string | null, phone: string | null) {
    const { data } = await supabase.rpc("check_client_duplicates", {
      p_document: document,
      p_phone: phone,
      p_exclude: client?.id ?? null,
    });
    return (data ?? []) as Duplicate[];
  }

  // Documento completo e válido: procura duplicado e (empresa) busca os dados na Receita
  useEffect(() => {
    if (!open || !docComplete || !docValid) {
      setDocDuplicate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const dups = await findDuplicates(docDigits, null);
      if (cancelled) return;
      const dup = dups.find((d) => d.match === "document") ?? null;
      setDocDuplicate(dup);
      if (dup || personType !== "pj" || editing || lastLookup.current === docDigits) return;
      lastLookup.current = docDigits;
      setLookingUp(true);
      const info = await lookupCNPJ(docDigits);
      if (cancelled) return;
      setLookingUp(false);
      if (!info) {
        toast.info("Não foi possível consultar a Receita agora. Preencha os dados manualmente.");
        return;
      }
      if (info.situation && info.situation.toUpperCase() !== "ATIVA") {
        toast.warning(`Atenção: situação do CNPJ na Receita: ${info.situation}`);
      }
      setForm((f) => ({
        ...f,
        name: f.name || info.tradeName || info.legalName,
        legal_name: f.legal_name || info.legalName,
        phone: f.phone || info.phone,
        email: f.email || info.email,
        address: f.address || info.address,
      }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docDigits, docComplete, docValid, personType]);

  async function checkPhone() {
    if (onlyDigits(form.phone).length < 8) {
      setPhoneDuplicate(null);
      return;
    }
    const dups = await findDuplicates(null, form.phone);
    setPhoneDuplicate(dups.find((d) => d.match === "phone") ?? null);
  }

  const sellers = (team.data || []).filter((p) => p.active || p.id === sellerId);

  function chooseSeller(id: string) {
    setSellerId(id);
    const sellerStore = team.data?.find((p) => p.id === id)?.store_id;
    if (sellerStore) setStoreId(sellerStore);
  }

  // Cliente antigo do tipo empresa ainda sem CNPJ: pode salvar sem CNPJ até completar
  const legacyWithoutCnpj = editing && client?.person_type === "pj" && !client?.document;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = clientSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (personType === "pj" && !docDigits && !legacyWithoutCnpj)
      return toast.error("Informe o CNPJ da empresa");
    if (docDigits && !docValid)
      return toast.error(personType === "pj" ? "CNPJ inválido" : "CPF inválido");
    if (docDuplicate)
      return toast.error("Este documento já está cadastrado. Abra o cliente existente.");
    if (!sellerId) return toast.error("Escolha o vendedor responsável");
    setSaving(true);
    const payload = {
      person_type: personType,
      document: docDigits || null,
      name: parsed.data.name,
      legal_name: personType === "pj" ? parsed.data.legal_name || null : null,
      contact_person: parsed.data.contact_person || null,
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
              : "A base de clientes é do grupo: o mesmo CNPJ/CPF não pode ser cadastrado duas vezes."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Tabs
            value={personType}
            onValueChange={(v) => {
              setPersonType(v as "pj" | "pf");
              setDoc("");
              lastLookup.current = "";
            }}
          >
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="pj">Empresa</TabsTrigger>
              <TabsTrigger value="pf">Pessoa física</TabsTrigger>
            </TabsList>
          </Tabs>

          <div>
            <Label htmlFor="doc">{personType === "pj" ? "CNPJ *" : "CPF (opcional)"}</Label>
            <div className="relative">
              <Input
                id="doc"
                inputMode="numeric"
                value={personType === "pj" ? formatCNPJ(doc) : formatCPF(doc)}
                onChange={(e) => setDoc(onlyDigits(e.target.value))}
                placeholder={personType === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
                autoFocus={!editing}
              />
              {lookingUp && (
                <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              )}
            </div>
            {docError && <p className="text-xs text-destructive mt-1">{docError}</p>}
            {personType === "pj" && !editing && !docComplete && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Search className="h-3 w-3" /> Ao completar o CNPJ, os dados da Receita são
                preenchidos sozinhos.
              </p>
            )}
            {legacyWithoutCnpj && !docDigits && (
              <p className="text-xs text-amber-700 mt-1">
                Cliente antigo sem CNPJ: complete quando puder.
              </p>
            )}
            {docDuplicate && (
              <div
                className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800 flex gap-2"
                role="alert"
              >
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  Já cadastrado: <strong>{docDuplicate.name}</strong> (cadastrado por{" "}
                  {docDuplicate.origin_name}, {docDuplicate.origin_store}).{" "}
                  <Link
                    to="/app/clientes/$id"
                    params={{ id: docDuplicate.id }}
                    className="underline font-medium"
                    onClick={() => onOpenChange(false)}
                  >
                    Abrir cliente
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="name">
              {personType === "pj" ? "Nome fantasia (como é conhecido) *" : "Nome *"}
            </Label>
            <Input id="name" value={form.name} onChange={set("name")} required maxLength={120} />
          </div>
          {personType === "pj" && (
            <div>
              <Label htmlFor="legal_name">Razão social</Label>
              <Input
                id="legal_name"
                value={form.legal_name}
                onChange={set("legal_name")}
                maxLength={160}
              />
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="contact_person">Pessoa de contato</Label>
              <Input
                id="contact_person"
                value={form.contact_person}
                onChange={set("contact_person")}
                maxLength={120}
                placeholder="Com quem falar"
              />
            </div>
            <div>
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                onBlur={checkPhone}
                maxLength={40}
              />
            </div>
          </div>
          {phoneDuplicate && !docDuplicate && (
            <div
              className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 flex gap-2"
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                Já existe um cliente com este telefone: <strong>{phoneDuplicate.name}</strong> (
                {phoneDuplicate.origin_name}, {phoneDuplicate.origin_store}).{" "}
                <Link
                  to="/app/clientes/$id"
                  params={{ id: phoneDuplicate.id }}
                  className="underline font-medium"
                  onClick={() => onOpenChange(false)}
                >
                  Abrir esse cliente
                </Link>{" "}
                ou continue se for outra pessoa.
              </div>
            </div>
          )}
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
            <p className="text-xs text-muted-foreground mt-1">
              Visíveis só para quem cadastrou e para o administrador.
            </p>
          </div>

          {isAdmin && (
            <div className="grid sm:grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
              <div>
                <Label>Cadastrado por</Label>
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
            <Button type="submit" disabled={saving || Boolean(docDuplicate) || Boolean(docError)}>
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
