import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { parseBRL } from "@/lib/crm";
import { POST_SALE_DAYS, addDays, fmtDateTime, toLocalInput } from "@/lib/datetime";
import type { Tables } from "@/integrations/supabase/types";

type Props = {
  clientId: string;
  sale?: Tables<"sales"> | null; // se vier, é edição
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

function amountToInput(v: number | null) {
  return v === null || v === undefined ? "" : Number(v).toFixed(2).replace(".", ",");
}

/**
 * Registrar ou editar uma venda.
 * Pós-venda automático = data da venda + 3 dias (calculado também no banco).
 * Se o usuário escolher a data, ela é mantida mesmo que a data da venda mude.
 */
export function SaleDialog({ clientId, sale, open, onOpenChange, onSaved }: Props) {
  const editing = Boolean(sale);
  const [form, setForm] = useState({ sold_at: toLocalInput(), amount: "", description: "" });
  const [autoPostSale, setAutoPostSale] = useState(true);
  const [postSaleAt, setPostSaleAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (sale) {
      setForm({
        sold_at: toLocalInput(sale.sold_at),
        amount: amountToInput(sale.amount),
        description: sale.description ?? "",
      });
      setAutoPostSale(!sale.post_sale_manual);
      setPostSaleAt(toLocalInput(sale.post_sale_due_at));
    } else {
      setForm({ sold_at: toLocalInput(), amount: "", description: "" });
      setAutoPostSale(true);
      setPostSaleAt("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sale?.id]);

  const soldAtDate = form.sold_at ? new Date(form.sold_at) : null;
  const autoDate =
    soldAtDate && !Number.isNaN(soldAtDate.getTime()) ? addDays(soldAtDate, POST_SALE_DAYS) : null;

  function toggleAuto(auto: boolean) {
    setAutoPostSale(auto);
    if (!auto && !postSaleAt && autoDate) setPostSaleAt(toLocalInput(autoDate));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!soldAtDate || Number.isNaN(soldAtDate.getTime()))
      return toast.error("Informe a data da venda");
    const amountNum = form.amount ? parseBRL(form.amount) : null;
    if (form.amount && (amountNum === null || Number.isNaN(amountNum) || amountNum < 0))
      return toast.error("Valor inválido");
    if (form.description.length > 2000) return toast.error("Descrição muito longa");
    if (!autoPostSale && !postSaleAt) return toast.error("Escolha a data do pós-venda");

    const postSaleDue = autoPostSale ? addDays(soldAtDate, POST_SALE_DAYS) : new Date(postSaleAt);
    const values = {
      sold_at: soldAtDate.toISOString(),
      amount: amountNum,
      description: form.description.trim() || null,
      post_sale_manual: !autoPostSale,
      post_sale_due_at: postSaleDue.toISOString(),
    };

    setSaving(true);
    let error;
    if (sale) {
      ({ error } = await supabase.from("sales").update(values).eq("id", sale.id));
    } else {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setSaving(false);
        return toast.error("Sessão expirada");
      }
      ({ error } = await supabase
        .from("sales")
        .insert({ ...values, user_id: userData.user.id, client_id: clientId }));
    }
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success(
      editing ? "Venda atualizada" : `Venda registrada — pós-venda em ${fmtDateTime(postSaleDue)}`,
    );
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar venda" : "Registrar venda"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "As alterações ficam registradas no Histórico de Atividades."
              : `O lembrete de pós-venda fica para ${POST_SALE_DAYS} dias depois, ou para a data que você escolher.`}
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

          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="auto-ps" className="text-sm">
                Pós-venda automático ({POST_SALE_DAYS} dias após a venda)
              </Label>
              <Switch id="auto-ps" checked={autoPostSale} onCheckedChange={toggleAuto} />
            </div>
            {autoPostSale ? (
              <p className="text-xs text-muted-foreground">
                {autoDate ? `Pós-venda em ${fmtDateTime(autoDate)}.` : "Informe a data da venda."}
              </p>
            ) : (
              <div>
                <Label htmlFor="ps-date">Data do pós-venda *</Label>
                <Input
                  id="ps-date"
                  type="datetime-local"
                  value={postSaleAt}
                  onChange={(e) => setPostSaleAt(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Esta data é mantida mesmo se a data da venda mudar.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Registrar venda"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
