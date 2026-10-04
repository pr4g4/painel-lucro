/**
 * Zenith: vendas com hora, reserva, reembolsos e pendentes.
 * Método ainda a confirmar com o Erick (webhook > CSV > extensão). Este módulo normaliza qualquer um deles para `vendas`.
 * Entrada normalizada (`VendaZenithBruta`) é o contrato que o webhook/CSV/extensão precisam preencher.
 */
import { executarColeta, upsertVendas, marcoZeroAtual, taxaDoDia, diaBrasilia, type NovaVenda } from "./base";
import { db, schema } from "@/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
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
  taxaPct?: number | null; taxaFixa?: number | null; cambioPct?: number | null; // na MOEDA DA VENDA, se a fonte informar
  produto?: string | null;
  ids?: string[]; // outros identificadores da mesma venda (referência, id do depósito…) para não duplicar entre CSV e webhook
  payload?: unknown;
};

const d = (x: string | Date | null | undefined) => (x == null ? null : x instanceof Date ? x : new Date(x));

/** Normaliza para a linha de `vendas`, recompondo deduções com os parâmetros vigentes quando a fonte não as detalha. */
export async function normalizarVenda(v: VendaZenithBruta, fonte = "zenith"): Promise<NovaVenda> {
  const marco = await marcoZeroAtual();
  const params = (await db.select().from(schema.parametros)).map((p) => ({ chave: p.chave, valor: p.valor, vigenciaInicio: p.vigenciaInicio, vigenciaFim: p.vigenciaFim }));
  const ref = d(v.aprovadaEm) ?? d(v.criadaEm) ?? new Date();
  const taxaCambio = v.moeda === "BRL" ? 1 : v.brlEstimado != null && v.bruto ? v.brlEstimado / v.bruto : await taxaMxnAte(ref);
  if (taxaCambio == null) throw new Error(`Venda ${v.id}: sem câmbio MXN→BRL (nem BRL estimado nem nenhuma taxa PTAX gravada; rode a coleta de câmbio)`);
  const brutoBrl = v.bruto * taxaCambio;
  // deduções informadas pela fonte vêm na moeda da venda → converte; senão calcula pelos parâmetros vigentes
  const taxaPct = v.taxaPct != null ? v.taxaPct * taxaCambio : brutoBrl * numeroVigente(params, "taxa_zenith_pct", ref) / 100;
  const taxaFixa = v.taxaFixa != null ? v.taxaFixa * taxaCambio : (v.moeda === "BRL" ? numeroVigente(params, "taxa_zenith_fixa_brl", ref) : numeroVigente(params, "taxa_zenith_fixa_mxn", ref) * taxaCambio);
  const cambioPct = v.cambioPct != null ? v.cambioPct * taxaCambio : brutoBrl * numeroVigente(params, "cambio_zenith_pct", ref) / 100;
  // líquido antes da reserva: bruto − deduções. Se a fonte listou "líquido" já descontada a reserva, a reserva é somada de volta (reserva não é custo).
  const liquidoCalc = brutoBrl - taxaPct - taxaFixa - cambioPct;
  // Reserva retida (não é custo). Se a fonte não informa, usa o parâmetro vigente (% do bruto):
  // conferido com o painel da Zenith: MX$149→114,22, 99→74,21, 199→154,22 = (bruto − 7,99% − 5 − 2%) − 10% do bruto.
  const reserva = v.reserva != null ? v.reserva * taxaCambio : (v.status === "pendente" ? 0 : brutoBrl * numeroVigente(params, "reserva_zenith_pct", ref, 10) / 100);
  const liquidoBrl = v.liquido != null ? v.liquido * taxaCambio + (v.reserva != null ? reserva : 0) : liquidoCalc;
  const aprovadaEm = v.status === "pendente" ? null : d(v.aprovadaEm);
  return {
    fonte, idOrigem: v.id, status: v.status, criadaEm: d(v.criadaEm) ?? aprovadaEm, aprovadaEm, reembolsadaEm: d(v.reembolsadaEm),
    produto: v.produto ?? null, moeda: v.moeda, brutoOriginal: String(v.bruto), taxaCambio: String(taxaCambio), brutoBrl: String(brutoBrl),
    taxaPctBrl: String(taxaPct), taxaFixaBrl: String(taxaFixa), cambioPctBrl: String(cambioPct), liquidoBrl: String(liquidoBrl),
    reservaBrl: String(reserva), reservaLiberadaEm: d(v.reservaLiberadaEm), historico: (aprovadaEm ?? ref) < marco,
    payload: { ...(typeof v.payload === "object" && v.payload ? v.payload as Record<string, unknown> : { bruto: v })
      , ids: [...new Set([v.id, ...(v.ids ?? [])].filter(Boolean))] },
  };
}

/** Taxa MXN→BRL vigente na data (última PTAX até a data, inclusive fim de semana/feriado); antes da primeira conhecida, usa a mais antiga. */
export async function taxaMxnAte(quando: Date): Promise<number | null> {
  const dia = diaBrasilia(quando);
  const ate = await taxaDoDia("MXNBRL", dia);
  if (ate) return ate.taxa;
  const [primeira] = await db.select().from(schema.cambio).where(eq(schema.cambio.par, "MXNBRL")).orderBy(schema.cambio.dia).limit(1);
  return primeira ? Number(primeira.taxa) : null;
}

/** Procura uma venda da Zenith por qualquer um dos identificadores (id da venda, referência, id do depósito…). */
export async function acharVendaZenith(candidatos: string[]) {
  const ids = [...new Set(candidatos.filter(Boolean))];
  if (!ids.length) return undefined;
  const [v] = await db.select().from(schema.vendas)
    .where(and(eq(schema.vendas.fonte, "zenith"), or(inArray(schema.vendas.idOrigem, ids), sql`(${schema.vendas.payload} -> 'ids') ?| array[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::text[]`)))
    .limit(1);
  return v;
}

/** Importa um lote (CSV ou lista). Tudo-ou-nada: valida todas as linhas antes; idempotente por (fonte, idOrigem) e pelos ids alternativos. */
export async function importarVendasZenith(lote: VendaZenithBruta[], origem = "zenith") {
  return executarColeta(origem === "zenith" ? "zenith" : origem, async () => {
    const rows: NovaVenda[] = []; const falhas: string[] = [];
    for (const v of lote) {
      try { rows.push(await normalizarVenda(v, "zenith")); }
      catch (e) { falhas.push(`${v.id}: ${e instanceof Error ? e.message.replace(/^Venda [^:]+: /, "") : String(e)}`); }
    }
    if (falhas.length) throw new Error(`${falhas.length} de ${lote.length} linha(s) não puderam ser importadas; nada foi gravado. Primeiras: ${falhas.slice(0, 3).join(" | ")}`);
    // uma venda já conhecida por outro id (ex.: veio pelo webhook com referenceId) é atualizada, não duplicada
    for (const r of rows) {
      const existente = await acharVendaZenith([r.idOrigem, ...(((r.payload as { ids?: string[] })?.ids) ?? [])]);
      if (existente && existente.idOrigem !== r.idOrigem) r.idOrigem = existente.idOrigem;
    }
    const registros = await upsertVendas(rows);
    return { registros };
  });
}

/**
 * CSV nativo da Zenith (Vendas → Conciliação em CSV → Baixar CSV): separador ";", campos entre aspas, decimal com vírgula,
 * data_hora_brt "01/10/2026, 03:37:25" (Brasília), status CAPTURED/PENDING, status_financeiro CONFIRMADO/NAO_CONFIRMADO,
 * retencao = reserva, valor_liquido = líquido já sem a reserva, sem produto.
 */
export function lerCsvConciliacaoZenith(csv: string): VendaZenithBruta[] {
  const linhas = dividirCsv(csv);
  if (linhas.length < 2) return [];
  const cab = linhas[0].map((h) => h.trim().toLowerCase());
  const idx = (n: string) => cab.indexOf(n);
  const col = (r: string[], n: string) => { const i = idx(n); return i >= 0 ? (r[i] ?? "").trim() : ""; };
  const num = (s: string) => { if (!s) return null; const n = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const out: VendaZenithBruta[] = [];
  for (const r of linhas.slice(1)) {
    const id = col(r, "id_venda"); if (!id) continue;
    const statusRaw = col(r, "status").toUpperCase();
    const statusFin = col(r, "status_financeiro").toUpperCase();
    const status: VendaZenithBruta["status"] = /CAPTUR|PAID|APPROV|CONFIRM/.test(statusRaw) ? "aprovada" : /REFUND|ESTORN|REEMB/.test(statusRaw) ? "reembolsada" : /CHARGE/.test(statusRaw) ? "chargeback" : /CANCEL/.test(statusRaw) ? "cancelada" : "pendente";
    const quando = dataBrt(col(r, "data_hora_brt"));
    const bruto = num(col(r, "valor_bruto")) ?? 0;
    const liquido = num(col(r, "valor_liquido")); const reserva = num(col(r, "retencao"));
    const moeda = col(r, "moeda").toUpperCase() === "BRL" ? "BRL" : "MXN";
    out.push({
      id, status, criadaEm: quando, aprovadaEm: status === "pendente" ? null : quando, moeda, bruto, liquido, reserva,
      produto: null, ids: [col(r, "referencia")].filter(Boolean),
      payload: { origem: "csv_conciliacao", id_venda: id, referencia: col(r, "referencia"), pais: col(r, "pais"), metodo_pagamento: col(r, "metodo_pagamento"), status: statusRaw, status_financeiro: statusFin, taxa_aplicada: col(r, "taxa_aplicada"), deducoes_totais: col(r, "deducoes_totais") },
    });
  }
  return out;
}

/** "01/10/2026, 03:37:25" (Brasília) → Date. */
export function dataBrt(s: string): Date | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})[ ,]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? "00"}-03:00`);
}

/** Divide CSV com aspas (campo pode conter ; ou quebra de linha). Separador ; ou , (detectado no cabeçalho). */
export function dividirCsv(texto: string): string[][] {
  const t = texto.replace(/^\uFEFF/, "");
  const primeira = t.split(/\r?\n/)[0] ?? "";
  const sep = (primeira.match(/;/g) ?? []).length >= (primeira.match(/,/g) ?? []).length ? ";" : ",";
  const out: string[][] = []; let linha: string[] = []; let campo = ""; let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; linha.push(campo); if (linha.some((x) => x !== "")) out.push(linha); linha = []; campo = ""; }
    else campo += c;
  }
  linha.push(campo); if (linha.some((x) => x !== "")) out.push(linha);
  return out;
}

/** Detecta o formato pelo cabeçalho: nativo da Zenith (id_venda;…) ou genérico. */
export function lerCsvZenithAuto(csv: string): VendaZenithBruta[] {
  const cab = (dividirCsv(csv)[0] ?? []).map((h) => h.trim().toLowerCase());
  return cab.includes("id_venda") ? lerCsvConciliacaoZenith(csv) : lerCsvZenith(csv);
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


