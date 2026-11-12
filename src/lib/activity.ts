// Histórico de Atividades: verificação da cadeia de hashes no navegador.
// A representação padronizada TEM de ser idêntica a public.activity_log_payload (supabase/02_historico_e_exclusoes.sql):
// cada campo vira "<tamanho em bytes UTF-8>:<valor>" e os campos são unidos por "|".

export type ActivityLog = {
  id: number;
  user_id: string | null;
  user_name: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  created_at: string;
  previous_hash: string;
  current_hash: string;
};

export const GENESIS = "GENESIS";

const encoder = new TextEncoder();

function field(value: string) {
  return `${encoder.encode(value).length}:${value}`;
}

/** created_at com milissegundos em UTC, igual a to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') */
function canonicalTime(value: string) {
  return new Date(value).toISOString();
}

export function activityPayload(row: ActivityLog) {
  return [
    String(row.id),
    canonicalTime(row.created_at),
    row.user_id ?? "",
    row.user_name,
    row.action,
    row.entity_type ?? "",
    row.entity_id ?? "",
    row.description,
    row.previous_hash,
  ]
    .map(field)
    .join("|");
}

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type ChainResult =
  | { ok: true; count: number }
  | { ok: false; count: number; brokenId: number; reason: "hash" | "link" };

/**
 * Recalcula a cadeia desde o primeiro registro.
 * - "link": previous_hash não bate com o hash do registro anterior (registro apagado ou fora de ordem)
 * - "hash": o hash recalculado não bate com o armazenado (conteúdo alterado)
 * As linhas devem vir em ordem crescente de id.
 */
export async function verifyChain(rows: ActivityLog[]): Promise<ChainResult> {
  let expectedPrevious = GENESIS;
  for (const row of rows) {
    if (row.previous_hash !== expectedPrevious) {
      return { ok: false, count: rows.length, brokenId: row.id, reason: "link" };
    }
    const computed = await sha256Hex(activityPayload(row));
    if (computed !== row.current_hash) {
      return { ok: false, count: rows.length, brokenId: row.id, reason: "hash" };
    }
    expectedPrevious = row.current_hash;
  }
  return { ok: true, count: rows.length };
}

export const ACTION_LABEL: Record<string, string> = {
  CRIOU: "Criou",
  EDITOU: "Editou",
  EXCLUIU: "Excluiu",
  SOLICITOU_EXCLUSAO: "Solicitou exclusão",
  APROVOU_EXCLUSAO: "Aprovou exclusão",
  RECUSOU_EXCLUSAO: "Recusou exclusão",
  TRANSFERIU: "Transferiu",
};

export const ENTITY_LABEL: Record<string, string> = {
  client: "Cliente",
  interaction: "Visita/agendamento",
  sale: "Venda",
  store: "Loja",
  user: "Usuário",
};

export function shortHash(hash: string) {
  return hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}
