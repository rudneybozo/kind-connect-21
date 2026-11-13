// Relatórios (só administradores): busca dos dados, totais e exportação para Excel/PDF.
import { supabase } from "@/integrations/supabase/client";
import { paymentLabel } from "@/lib/crm";

export type ReportFilters = {
  from: string; // yyyy-mm-dd (dia inteiro, horário local)
  to: string;
  storeId: string; // "all" ou id
  sellerId: string; // "all" ou id
  method: string; // "all" ou forma de pagamento (sem pendência)
};

export type SaleRow = {
  id: string;
  sold_at: string;
  amount: number | null;
  payment_method: string | null;
  nf_number: string | null;
  nf_date: string | null;
  user_id: string;
  store_id: string | null;
  client_id: string;
  settles_sale_id: string | null;
  settled_at: string | null;
  client_name: string;
};

export type ProductivityRow = {
  userId: string;
  contacts: number;
  followUpsDone: number;
  followUpsOverdue: number;
  postSalesDone: number;
  postSalesOverdue: number;
  newClients: number;
  sales: number;
  salesTotal: number;
  alerts: number;
};

export type GroupRow = { key: string; label: string; qty: number; total: number; ticket: number };

export function periodBounds(f: Pick<ReportFilters, "from" | "to">) {
  const start = new Date(`${f.from}T00:00:00`);
  const end = new Date(`${f.to}T23:59:59.999`);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/** PostgREST devolve no máximo 1000 linhas por vez: busca em páginas */
async function fetchAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  const all: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = (data as T[]) ?? [];
    all.push(...rows);
    if (rows.length < size) break;
  }
  return all;
}

type RawSale = Omit<SaleRow, "client_name"> & { clients: { name: string } | null };

function toSaleRow(r: RawSale): SaleRow {
  const { clients, ...rest } = r;
  return { ...rest, client_name: clients?.name ?? "—" };
}

const SALE_COLUMNS =
  "id, sold_at, amount, payment_method, nf_number, nf_date, user_id, store_id, client_id, settles_sale_id, settled_at, clients(name)";

/** Vendas do período (sem pendências). A quitação conta na data da NF. */
export async function fetchSales(f: ReportFilters): Promise<SaleRow[]> {
  const { startISO, endISO } = periodBounds(f);
  const rows = await fetchAll<RawSale>((a, b) => {
    let q = supabase
      .from("sales")
      .select(SALE_COLUMNS)
      .gte("sold_at", startISO)
      .lte("sold_at", endISO)
      .or("payment_method.is.null,payment_method.neq.pendencia")
      .order("sold_at", { ascending: true })
      .range(a, b);
    if (f.storeId !== "all") q = q.eq("store_id", f.storeId);
    if (f.sellerId !== "all") q = q.eq("user_id", f.sellerId);
    if (f.method !== "all")
      q = f.method === "none" ? q.is("payment_method", null) : q.eq("payment_method", f.method);
    return q;
  });
  return rows.map(toSaleRow);
}

/** Pendências em aberto (qualquer data), por loja/vendedor */
export async function fetchOpenPendencies(f: ReportFilters): Promise<SaleRow[]> {
  const rows = await fetchAll<RawSale>((a, b) => {
    let q = supabase
      .from("sales")
      .select(SALE_COLUMNS)
      .eq("payment_method", "pendencia")
      .is("settled_at", null)
      .order("sold_at", { ascending: true })
      .range(a, b);
    if (f.storeId !== "all") q = q.eq("store_id", f.storeId);
    if (f.sellerId !== "all") q = q.eq("user_id", f.sellerId);
    return q;
  });
  return rows.map(toSaleRow);
}

export function groupSales(
  rows: SaleRow[],
  keyOf: (r: SaleRow) => string,
  labelOf: (key: string) => string,
): GroupRow[] {
  const map = new Map<string, { qty: number; total: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = map.get(k) ?? { qty: 0, total: 0 };
    g.qty += 1;
    g.total += Number(r.amount ?? 0);
    map.set(k, g);
  }
  return [...map.entries()]
    .map(([key, g]) => ({
      key,
      label: labelOf(key),
      qty: g.qty,
      total: g.total,
      ticket: g.qty ? g.total / g.qty : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function summarize(rows: SaleRow[]) {
  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  return { qty: rows.length, total, ticket: rows.length ? total / rows.length : 0 };
}

/** Produtividade por vendedor no período (atrasos = situação de agora) */
export async function fetchProductivity(f: ReportFilters): Promise<ProductivityRow[]> {
  const { startISO, endISO } = periodBounds(f);
  const nowISO = new Date().toISOString();
  const scope = <T extends { eq: (c: string, v: string) => T }>(q: T) => {
    let r = q;
    if (f.storeId !== "all") r = r.eq("store_id", f.storeId);
    if (f.sellerId !== "all") r = r.eq("user_id", f.sellerId);
    return r;
  };

  type U = { user_id: string };
  const [contacts, fuDone, fuOverdue, psDone, psOverdue, sales, newClients, alerts] =
    await Promise.all([
      fetchAll<U>((a, b) =>
        scope(
          supabase
            .from("interactions")
            .select("user_id, store_id")
            .gte("happened_at", startISO)
            .lte("happened_at", endISO),
        ).range(a, b),
      ),
      fetchAll<U>((a, b) =>
        scope(
          supabase
            .from("interactions")
            .select("user_id, store_id")
            .eq("follow_up_done", true)
            .gte("follow_up_at", startISO)
            .lte("follow_up_at", endISO),
        ).range(a, b),
      ),
      fetchAll<U>((a, b) =>
        scope(
          supabase
            .from("interactions")
            .select("user_id, store_id")
            .eq("follow_up_done", false)
            .lt("follow_up_at", nowISO),
        ).range(a, b),
      ),
      fetchAll<U>((a, b) =>
        scope(
          supabase
            .from("sales")
            .select("user_id, store_id")
            .is("settles_sale_id", null)
            .gte("post_sale_done_at", startISO)
            .lte("post_sale_done_at", endISO),
        ).range(a, b),
      ),
      fetchAll<U>((a, b) =>
        scope(
          supabase
            .from("sales")
            .select("user_id, store_id")
            .is("settles_sale_id", null)
            .is("post_sale_done_at", null)
            .lt("post_sale_due_at", nowISO),
        ).range(a, b),
      ),
      fetchSales({ ...f, method: "all" }),
      fetchAll<U>((a, b) =>
        scope(
          supabase
            .from("clients")
            .select("user_id, store_id")
            .gte("created_at", startISO)
            .lte("created_at", endISO),
        ).range(a, b),
      ),
      fetchAll<U>((a, b) => {
        let q = supabase
          .from("attendance_alerts")
          .select("user_id")
          .gte("created_at", startISO)
          .lte("created_at", endISO);
        if (f.sellerId !== "all") q = q.eq("user_id", f.sellerId);
        return q.range(a, b);
      }),
    ]);

  const map = new Map<string, ProductivityRow>();
  const row = (id: string) => {
    let r = map.get(id);
    if (!r) {
      r = {
        userId: id,
        contacts: 0,
        followUpsDone: 0,
        followUpsOverdue: 0,
        postSalesDone: 0,
        postSalesOverdue: 0,
        newClients: 0,
        sales: 0,
        salesTotal: 0,
        alerts: 0,
      };
      map.set(id, r);
    }
    return r;
  };
  contacts.forEach((x) => row(x.user_id).contacts++);
  fuDone.forEach((x) => row(x.user_id).followUpsDone++);
  fuOverdue.forEach((x) => row(x.user_id).followUpsOverdue++);
  psDone.forEach((x) => row(x.user_id).postSalesDone++);
  psOverdue.forEach((x) => row(x.user_id).postSalesOverdue++);
  newClients.forEach((x) => row(x.user_id).newClients++);
  alerts.forEach((x) => row(x.user_id).alerts++);
  sales.forEach((s) => {
    const r = row(s.user_id);
    r.sales++;
    r.salesTotal += Number(s.amount ?? 0);
  });
  return [...map.values()].sort((a, b) => b.salesTotal - a.salesTotal || b.contacts - a.contacts);
}

// ---------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------
export type ExportTable = {
  title: string;
  head: string[];
  rows: (string | number)[][];
  money?: number[];
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export async function exportExcel(fileName: string, tables: ExportTable[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const sheets = tables.map((t) => ({
    sheet: t.title.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"),
    stickyRowsCount: 1,
    columns: t.head.map((h) => ({ width: Math.max(12, Math.min(45, h.length + 6)) })),
    data: [
      t.head.map((h) => ({ value: h, fontWeight: "bold" as const })),
      ...t.rows.map((r) =>
        r.map((v, i) =>
          typeof v === "number"
            ? { value: v, type: Number, format: t.money?.includes(i) ? "#,##0.00" : "0" }
            : { value: String(v ?? ""), type: String },
        ),
      ),
    ],
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await writeXlsxFile(sheets as any).toFile(fileName);
}

export async function exportPdf(
  fileName: string,
  title: string,
  subtitle: string,
  tables: ExportTable[],
) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text(title, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(subtitle, 40, 58);
  doc.setTextColor(0);
  let y = 76;
  for (const t of tables) {
    doc.setFontSize(12);
    if (y > 520) {
      doc.addPage();
      y = 40;
    }
    doc.text(t.title, 40, y);
    autoTable(doc, {
      startY: y + 8,
      head: [t.head],
      body: t.rows.map((r) =>
        r.map((v, i) =>
          typeof v === "number" && t.money?.includes(i) ? brl.format(v) : String(v ?? ""),
        ),
      ),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 23, 42] },
      margin: { left: 40, right: 40 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 28;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Vendas CRM - página ${i} de ${pages}`, 40, doc.internal.pageSize.getHeight() - 20);
  }
  doc.save(fileName);
}

export function methodLabel(m: string | null) {
  return paymentLabel(m);
}
