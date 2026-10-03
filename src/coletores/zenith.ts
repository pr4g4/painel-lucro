/**
 * Zenith: vendas com hora, reserva, reembolsos e pendentes.
 * Método ainda a confirmar com o Erick (webhook > CSV > extensão). Este módulo normaliza qualquer um deles para `vendas`.
 * Entrada normalizada (`VendaZenithBruta`) é o contrato que o webhook/CSV/extensão precisam preencher.
 */
import { executarColeta, upsertVendas, marcoZeroAtual, type NovaVenda } from "./base";
import { db, schema } from "@/db";
import { and, eq, isNull } from "drizzle-orm";
import { numeroVigente } from "@/lib/calculo";

export type VendaZenithBruta = {
  id: string;
  status: "aprovada" | "pendente" | "reembolsada" | "chargeback" | "cancelada";
  criadaEm?: string | Date | null;
  aprovadaEm?: string | Date | null;
  reembolsadaEm?: string | Date | null;
  moeda: "MXN" | "BRL";
  bruto: number;
  brlEstimado?: number | null; // bruto convertido em BRL, como a Zenith mostra
  liquido?: number | null; // líquido listado pela Zenith (depois de taxas, ANTES de somar a reserva de volta)
  reserva?: number | null; // reserva retida
  reservaLiberadaEm?: string | Date | null;
  taxaPct?: number | null; taxaFixa?: number | null; cambioPct?: number | null; // em BRL, se a fonte informar
  produto?: string | null;
  payload?: unknown;
};

const d = (x: string | Date | null | undefined) => (x == null ? null : x instanceof Date ? x : new Date(x));

/** Normaliza para a linha de `vendas`, recompondo deduções com os parâmetros vigentes quando a fonte não as detalha. */
export async function normalizarVenda(v: VendaZenithBruta, fonte = "zenith"): Promise<NovaVenda> {
  const marco = await marcoZeroAtual();
  const params = (await db.select().from(schema.parametros)).map((p) => ({ chave: p.chave, valor: p.valor, vigenciaInicio: p.vigenciaInicio, vigenciaFim: p.vigenciaFim }));
  const ref = d(v.aprovadaEm) ?? d(v.criadaEm) ?? new Date();
  const taxaCambio = v.moeda === "BRL" ? 1 : v.brlEstimado != null && v.bruto ? v.brlEstimado / v.bruto : await ultimaTaxaMxn();
  if (taxaCambio == null) throw new Error(`Venda ${v.id}: sem câmbio MXN→BRL (nem BRL estimado nem taxa conhecida)`);
  const brutoBrl = v.bruto * taxaCambio;
  const taxaPct = v.taxaPct ?? brutoBrl * numeroVigente(params, "taxa_zenith_pct", ref) / 100;
  const taxaFixa = v.taxaFixa ?? (v.moeda === "BRL" ? numeroVigente(params, "taxa_zenith_fixa_brl", ref) : numeroVigente(params, "taxa_zenith_fixa_mxn", ref) * taxaCambio);
  const cambioPct = v.cambioPct ?? brutoBrl * numeroVigente(params, "cambio_zenith_pct", ref) / 100;
  // líquido antes da reserva: bruto − deduções. Se a fonte listou "líquido" já descontada a reserva, a reserva é somada de volta pelo cálculo (reserva não é custo).
  const liquidoCalc = brutoBrl - taxaPct - taxaFixa - cambioPct;
  const reserva = v.reserva ?? 0;
  const liquidoBrl = v.liquido != null && v.reserva != null ? v.liquido + v.reserva : v.liquido != null && v.reserva == null ? v.liquido : liquidoCalc;
  const aprovadaEm = v.status === "pendente" ? null : d(v.aprovadaEm);
  return {
    fonte, idOrigem: v.id, status: v.status, criadaEm: d(v.criadaEm) ?? aprovadaEm, aprovadaEm, reembolsadaEm: d(v.reembolsadaEm),
    produto: v.produto ?? null, moeda: v.moeda, brutoOriginal: String(v.bruto), taxaCambio: String(taxaCambio), brutoBrl: String(brutoBrl),
    taxaPctBrl: String(taxaPct), taxaFixaBrl: String(taxaFixa), cambioPctBrl: String(cambioPct), liquidoBrl: String(liquidoBrl),
    reservaBrl: String(reserva), reservaLiberadaEm: d(v.reservaLiberadaEm), historico: (aprovadaEm ?? ref) < marco, payload: v.payload ?? v,
  };
}

async function ultimaTaxaMxn(): Promise<number | null> {
  const [r] = await db.select().from(schema.cambio).where(eq(schema.cambio.par, "MXNBRL")).orderBy(schema.cambio.dia).limit(1000);
  if (!r) return null;
  const rows = await db.select().from(schema.cambio).where(eq(schema.cambio.par, "MXNBRL"));
  return Number(rows.sort((a, b) => b.dia.localeCompare(a.dia))[0].taxa);
}

/** Importa um lote (webhook, CSV ou extensão). Idempotente por (fonte, idOrigem). */
export async function importarVendasZenith(lote: VendaZenithBruta[], origem = "zenith") {
  return executarColeta(origem === "zenith" ? "zenith" : origem, async () => {
    const rows: NovaVenda[] = [];
    for (const v of lote) rows.push(await normalizarVenda(v, "zenith"));
    const registros = await upsertVendas(rows);
    return { registros };
  });
}

/** CSV exportado da Zenith → VendaZenithBruta[]. Cabeçalhos aceitos (case-insensitive): id, status, data, aprovado_em, reembolsado_em, moeda, bruto, brl_estimado, liquido, reserva, produto. */
export function lerCsvZenith(csv: string): VendaZenithBruta[] {
  const linhas = csv.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const sep = linhas[0].includes(";") ? ";" : ",";
  const cab = linhas[0].split(sep).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (r: string[], ...nomes: string[]) => { for (const n of nomes) { const i = cab.indexOf(n); if (i >= 0 && r[i] !== undefined && r[i] !== "") return r[i].trim(); } return null; };
  const num = (s: string | null) => (s == null ? null : Number(s.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")));
  const st = (s: string | null): VendaZenithBruta["status"] => {
    const x = (s ?? "").toLowerCase();
    if (/aprov|pago|paid|complet/.test(x)) return "aprovada";
    if (/reemb|refund|devolv/.test(x)) return "reembolsada";
    if (/charge/.test(x)) return "chargeback";
    if (/cancel/.test(x)) return "cancelada";
    return "pendente";
  };
  return linhas.slice(1).map((l) => {
    const r = l.split(sep);
    const status = st(col(r, "status"));
    return {
      id: col(r, "id", "id_venda", "transacao", "transaction_id") ?? l,
      status,
      criadaEm: col(r, "data", "criado_em", "created_at"),
      aprovadaEm: col(r, "aprovado_em", "aprovada_em", "data_aprovacao", "approved_at") ?? (status === "aprovada" ? col(r, "data", "criado_em") : null),
      reembolsadaEm: col(r, "reembolsado_em", "refunded_at", "data_reembolso"),
      moeda: ((col(r, "moeda", "currency") ?? "MXN").toUpperCase() === "BRL" ? "BRL" : "MXN"),
      bruto: num(col(r, "bruto", "valor", "amount", "valor_bruto")) ?? 0,
      brlEstimado: num(col(r, "brl_estimado", "valor_brl", "brl")),
      liquido: num(col(r, "liquido", "líquido", "net", "valor_liquido")),
      reserva: num(col(r, "reserva", "reserve")),
      produto: col(r, "produto", "product"),
      payload: Object.fromEntries(cab.map((c, i) => [c, r[i]])),
    };
  });
}

export const _ = { and, isNull };
