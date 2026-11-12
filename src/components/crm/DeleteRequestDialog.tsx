import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { useMe, type DeletableType } from "@/lib/crm";

type Props = {
  entityType: DeletableType;
  entityId: string;
  label: string; // ex.: 'o cliente "Mercado Bom"'
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void; // só quando o admin exclui na hora
  onRequested?: () => void;
};

/**
 * Vendedor: envia uma solicitação de exclusão para o administrador aprovar.
 * Administrador: exclui na hora. Nos dois casos é exclusão lógica (o registro fica guardado)
 * e tudo vai para o Histórico de Atividades.
 */
export function DeleteRequestDialog({
  entityType,
  entityId,
  label,
  open,
  onOpenChange,
  onDeleted,
  onRequested,
}: Props) {
  const me = useMe();
  const qc = useQueryClient();
  const isAdmin = me.data?.role === "admin";
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  async function submit() {
    if (!isAdmin && !reason.trim()) return toast.error("Explique o motivo para o administrador");
    setBusy(true);
    const { data, error } = await supabase.rpc("request_deletion", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["pendingDeletions"] });
    qc.invalidateQueries({ queryKey: ["pendingDeletionCount"] });
    if (data === "deleted") {
      toast.success("Excluído");
      onDeleted?.();
    } else {
      toast.success("Solicitação enviada. O administrador vai analisar.");
      onRequested?.();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isAdmin ? "Excluir registro?" : "Solicitar exclusão"}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? `Você vai excluir ${label}. O registro sai das telas, mas continua guardado e a ação fica no Histórico de Atividades.`
              : `A exclusão de ${label} só acontece depois que o administrador aprovar.`}
            {entityType === "client" &&
              " As visitas e vendas deste cliente também deixam de aparecer."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="del-reason">Motivo{isAdmin ? " (opcional)" : " *"}</Label>
          <Textarea
            id="del-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex.: cadastrado em duplicidade"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? "Enviando…" : isAdmin ? "Excluir" : "Enviar solicitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
