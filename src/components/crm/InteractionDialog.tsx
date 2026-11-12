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
import { toLocalInput } from "@/lib/datetime";
import type { Tables } from "@/integrations/supabase/types";

type InteractionType = "visita" | "ligacao" | "reuniao" | "outro";

const interactionSchema = z.object({
  type: z.enum(["visita", "ligacao", "reuniao", "outro"]),
  happened_at: z.string().min(1, "Informe data e hora"),
  contact_person: z.string().trim().max(120),
  notes: z.string().trim().max(2000),
  follow_up_at: z.string(),
});

type Props = {
  clientId: string;
  interaction?: Tables<"interactions"> | null; // se vier, é edição
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

/** Registrar ou editar uma visita/contato e o retorno agendado. */
export function InteractionDialog({ clientId, interaction, open, onOpenChange, onSaved }: Props) {
  const editing = Boolean(interaction);
  const [form, setForm] = useState({
    type: "visita" as InteractionType,
    happened_at: toLocalInput(),
    contact_person: "",
    notes: "",
    follow_up_at: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (interaction) {
      setForm({
        type: (["visita", "ligacao", "reuniao", "outro"].includes(interaction.type)
          ? interaction.type
          : "outro") as InteractionType,
        happened_at: toLocalInput(interaction.happened_at),
        contact_person: interaction.contact_person ?? "",
        notes: interaction.notes ?? "",
        follow_up_at: interaction.follow_up_at ? toLocalInput(interaction.follow_up_at) : "",
      });
    } else {
      setForm({
        type: "visita",
        happened_at: toLocalInput(),
        contact_person: "",
        notes: "",
        follow_up_at: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, interaction?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = interactionSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSaving(true);
    const values = {
      type: parsed.data.type,
      happened_at: new Date(parsed.data.happened_at).toISOString(),
      contact_person: parsed.data.contact_person || null,
      notes: parsed.data.notes || null,
      follow_up_at: parsed.data.follow_up_at
        ? new Date(parsed.data.follow_up_at).toISOString()
        : null,
    };

    let error;
    if (interaction) {
      // Retorno reagendado volta a ficar pendente
      const rescheduled =
        values.follow_up_at !== null &&
        (!interaction.follow_up_at ||
          new Date(interaction.follow_up_at).getTime() !== new Date(values.follow_up_at).getTime());
      ({ error } = await supabase
        .from("interactions")
        .update({ ...values, ...(rescheduled ? { follow_up_done: false } : {}) })
        .eq("id", interaction.id));
    } else {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setSaving(false);
        return toast.error("Sessão expirada");
      }
      ({ error } = await supabase
        .from("interactions")
        .insert({ ...values, user_id: userData.user.id, client_id: clientId }));
    }
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success(editing ? "Agendamento atualizado" : "Registro salvo");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar visita/agendamento" : "Registrar visita/contato"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "As alterações ficam registradas no Histórico de Atividades."
              : "Anote o que foi conversado e quando retornar."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as InteractionType })}
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
            <div className="flex gap-2">
              <Input
                id="fu"
                type="datetime-local"
                value={form.follow_up_at}
                onChange={(e) => setForm({ ...form, follow_up_at: e.target.value })}
              />
              {form.follow_up_at && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm({ ...form, follow_up_at: "" })}
                >
                  Limpar
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Opcional. Aparece como pendência no painel.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
