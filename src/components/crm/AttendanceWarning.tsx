import { useEffect, useState } from "react";
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
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export type AttendanceInfo = {
  other_name: string;
  other_store: string;
  last_at: string;
  days_ago: number;
};

/**
 * "Este cliente já é atendido por X. Deseja realmente agendar este contato?"
 * Não bloqueia: pede um motivo, que vai para o administrador (o outro vendedor não é avisado).
 */
export function AttendanceWarning({
  info,
  action,
  open,
  onCancel,
  onConfirm,
}: {
  info: AttendanceInfo | null;
  action: "contato" | "venda";
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!info) return null;
  const when =
    info.days_ago === 0 ? "hoje" : info.days_ago === 1 ? "há 1 dia" : `há ${info.days_ago} dias`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Cliente já atendido
          </DialogTitle>
          <DialogDescription className="text-base text-foreground">
            Este cliente já é atendido por <strong>{info.other_name}</strong> ({info.other_store}),
            último contato {when}.{" "}
            {action === "venda"
              ? "Deseja realmente registrar esta venda?"
              : "Deseja realmente agendar este contato?"}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="att-reason">Motivo *</Label>
          <Textarea
            id="att-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Ex.: o cliente me procurou diretamente"
          />
          <p className="text-xs text-muted-foreground mt-1">O administrador será informado.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!reason.trim()) return toast.error("Informe o motivo");
              onConfirm(reason.trim());
            }}
          >
            Continuar mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
