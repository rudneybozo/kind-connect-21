import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Valor para <input type="datetime-local"> no horário do aparelho */
export function toLocalInput(d?: Date | string | null) {
  const dt = d ? new Date(d) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export const POST_SALE_DAYS = 3;

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

export function fmtDateTime(d: string | Date) {
  return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function fmtDate(d: string | Date) {
  return format(new Date(d), "dd/MM/yyyy", { locale: ptBR });
}
