// CPF/CNPJ: limpeza, máscara, validação (mesma regra do banco) e consulta pública de CNPJ.

export function onlyDigits(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

export function formatCNPJ(v: string | null | undefined) {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function formatCPF(v: string | null | undefined) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function formatDocument(v: string | null | undefined, personType?: string) {
  const d = onlyDigits(v);
  if (!d) return "";
  return personType === "pf" || d.length === 11 ? formatCPF(d) : formatCNPJ(d);
}

export function isValidCPF(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCNPJ(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (weights: number[]) => {
    const s = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return (
    calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[12]) &&
    calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[13])
  );
}

export type CnpjInfo = {
  legalName: string;
  tradeName: string;
  phone: string;
  email: string;
  address: string;
  situation: string;
};

function formatPhone(raw: string) {
  const d = onlyDigits(raw);
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return raw;
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/(^|\s|-|\/)(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Consulta pública (BrasilAPI / Receita Federal). Retorna null se não encontrar ou se o serviço falhar. */
export async function lookupCNPJ(cnpj: string): Promise<CnpjInfo | null> {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const j = await res.json();
    const tc = (v: unknown) => (v ? titleCase(String(v)) : "");
    const street = [tc(j.descricao_tipo_de_logradouro), tc(j.logradouro)].filter(Boolean).join(" ");
    const address = [
      [street, j.numero].filter(Boolean).join(", "),
      tc(j.complemento),
      tc(j.bairro),
      [tc(j.municipio), j.uf].filter(Boolean).join("/"),
      j.cep ? `CEP ${String(j.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : "",
    ]
      .filter((p) => p && String(p).trim())
      .join(" — ");
    return {
      legalName: titleCase(j.razao_social ?? ""),
      tradeName: titleCase(j.nome_fantasia ?? ""),
      phone: j.ddd_telefone_1 ? formatPhone(j.ddd_telefone_1) : "",
      email: (j.email ?? "").toLowerCase(),
      address,
      situation: j.descricao_situacao_cadastral ?? "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
