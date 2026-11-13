import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { PAYMENT_METHODS, formatBRL } from "@/lib/crm";
import { fmtDate } from "@/lib/datetime";
import type { Tables } from "@/integrations/supabase/types";

function todayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Quitar uma pendência: NF e data da NF obrigatórias. Gera a venda paga, que conta na data da NF. */
export function SettleDialog({
  sale,
  open,
  onOpenChange,
  onSettled,
}: {
  sale: Tables<"sales"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettled: () => void;
}) {
  const [method, setMethod] = useState("");
  const [nf, setNf] = useState("");
  const [nfDate, setNfDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod("");
      setNf("");
      setNfDate(todayLocal());
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sale) return;
    if (!method) return toast.error("Escolha a forma de pagamento");
    if (!nf.trim()) return toast.error("Informe o número da NF");
    if (!nfDate) return toast.error("Informe a data da NF");
    setBusy(true);
    const { error } = await supabase.rpc("settle_pending_sale", {
      p_sale_id: sale.id,
      p_payment_method: method,
      p_nf_number: nf.trim(),
      p_nf_date: nfDate,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Pendência quitada");
    onOpenChange(false);
    onSettled();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quitar pendência</DialogTitle>
          <DialogDescription>
            {sale && (
              <>
                Pendência de <strong>{formatBRL(sale.amount)}</strong> registrada em{" "}
                {fmtDate(sale.sold_at)}. O valor entra no relatório de vendas na data da NF.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Forma de pagamento *</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger aria-label="Forma de pagamento da quitação">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.filter((m) => m.value !== "pendencia").map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="settle-nf">Número da NF *</Label>
              <Input
                id="settle-nf"
                value={nf}
                onChange={(e) => setNf(e.target.value)}
                maxLength={40}
                required
              />
            </div>
            <div>
              <Label htmlFor="settle-nf-date">Data da NF *</Label>
              <Input
                id="settle-nf-date"
                type="date"
                value={nfDate}
                onChange={(e) => setNfDate(e.target.value)}
                max={todayLocal()}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy ? "Quitando…" : "Quitar pendência"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
