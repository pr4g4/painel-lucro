/**
 * Câmbio por dia:
 *  - USD→BRL: PTAX (Banco Central, API Olinda), boletim de fechamento.
 *  - MXN→BRL: o PTAX NÃO publica MXN (só AUD, CAD, CHF, DKK, EUR, GBP, JPY, NOK, SEK, USD). Usamos taxa cruzada:
 *      MXNBRL = PTAX USDBRL do dia (ou última até a data) × MXN→USD do ECB (api.frankfurter.app, grátis, sem chave)  → fonte "ptax_usd_x_ecb"
 *      sem nenhuma PTAX USD disponível → MXN→BRL direto do ECB                                                       → fonte "ecb_direto"
 *  Uma taxa por dia; fim de semana/feriado usa a última anterior (resolvido na leitura). A fonte fica gravada em cada linha.
 */
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { executarColeta, diaBrasilia } from "./base";

export type CotacaoDia = { dia: string; taxa: number }; // dia = AAAA-MM-DD
export type Cruzada = { dia: string; mxnUsd: number; mxnBrl: number | null };
export interface CambioCliente {
  /** PTAX USD→BRL por dia (venda), só dias úteis. */
  ptaxUsd(deDia: string, ateDia: string): Promise<CotacaoDia[]>;
  /** ECB (Frankfurter): MXN→USD e MXN→BRL por dia, só dias úteis. */
  ecbMxn(deDia: string, ateDia: string): Promise<Cruzada[]>;
}

const PTAX = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";
const FRANKFURTER = "https://api.frankfurter.app";
const fmtPtax = (d: string) => { const [a, m, dd] = d.split("-"); return `${m}-${dd}-${a}`; };

export const clienteReal: CambioCliente = {
  async ptaxUsd(deDia, ateDia) {
    const url = `${PTAX}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${fmtPtax(deDia)}'&@dataFinalCotacao='${fmtPtax(ateDia)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`PTAX USD HTTP ${r.status}`);
    const j = (await r.json()) as { value: { cotacaoVenda: number; dataHoraCotacao: string }[] };
    const porDia = new Map<string, number>();
    for (const v of j.value) porDia.set(v.dataHoraCotacao.slice(0, 10), v.cotacaoVenda);
    return [...porDia.entries()].map(([dia, taxa]) => ({ dia, taxa })).sort((a, b) => a.dia.localeCompare(b.dia));
  },
  async ecbMxn(deDia, ateDia) {
    const r = await fetch(`${FRANKFURTER}/${deDia}..${ateDia}?from=MXN&to=USD,BRL`, { cache: "no-store" });
    if (!r.ok) throw new Error(`Frankfurter (ECB) HTTP ${r.status}`);
    const j = (await r.json()) as { rates: Record<string, { USD?: number; BRL?: number }> };
    return Object.entries(j.rates ?? {}).filter(([, v]) => typeof v.USD === "number")
      .map(([dia, v]) => ({ dia, mxnUsd: v.USD!, mxnBrl: typeof v.BRL === "number" ? v.BRL : null })).sort((a, b) => a.dia.localeCompare(b.dia));
  },
};

async function gravar(dia: string, par: string, taxa: number, fonte: string, provisoria = false) {
  await db.insert(schema.cambio).values({ dia, par, taxa: String(taxa), fonte, provisoria })
    .onConflictDoUpdate({ target: [schema.cambio.dia, schema.cambio.par], set: { taxa: String(taxa), provisoria, fonte, coletadoEm: new Date() } });
}

/** Última PTAX USD até o dia (na tabela). */
async function ptaxUsdAte(dia: string): Promise<number | null> {
  const [r] = await db.select().from(schema.cambio).where(and(eq(schema.cambio.par, "USDBRL"), lte(schema.cambio.dia, dia), eq(schema.cambio.fonte, "ptax"))).orderBy(desc(schema.cambio.dia)).limit(1);
  return r ? Number(r.taxa) : null;
}

export async function coletarCambio(cliente: CambioCliente = clienteReal, agora = new Date()) {
  return executarColeta("cambio", async () => {
    const hoje = diaBrasilia(agora);
    const detalhe: Record<string, unknown> = {};
    const janela = async (par: string) => {
      // 15 dias normalmente; 45 quando ainda não há NENHUMA taxa do par (ex.: primeira coleta num fim de semana)
      const [existe] = await db.select({ dia: schema.cambio.dia }).from(schema.cambio).where(eq(schema.cambio.par, par)).limit(1);
      return existe ? 15 : 45;
    };
    let gravados = 0;

    // 1) USD→BRL pelo PTAX
    const dUsd = await janela("USDBRL");
    const usd = await cliente.ptaxUsd(diaBrasilia(new Date(agora.getTime() - dUsd * 86_400_000)), hoje);
    for (const c of usd) { await gravar(c.dia, "USDBRL", c.taxa, "ptax"); gravados++; }
    if (usd.length && !usd.some((c) => c.dia === hoje)) {
      const [existe] = await db.select().from(schema.cambio).where(and(eq(schema.cambio.dia, hoje), eq(schema.cambio.par, "USDBRL"))).limit(1);
      if (!existe) await gravar(hoje, "USDBRL", usd[usd.length - 1].taxa, "ptax", true);
    }
    detalhe.USDBRL = { janelaDias: dUsd, recebidas: usd.length, ultima: usd[usd.length - 1]?.dia ?? null, fonte: "ptax" };

    // 2) MXN→BRL cruzado: PTAX USDBRL (última até o dia) × MXN→USD do ECB; sem PTAX, MXN→BRL direto do ECB
    const dMxn = await janela("MXNBRL");
    let mxnInfo: Record<string, unknown> = {};
    try {
      const cruz = await cliente.ecbMxn(diaBrasilia(new Date(agora.getTime() - dMxn * 86_400_000)), hoje);
      let cruzadas = 0, diretas = 0;
      for (const c of cruz) {
        const usdBrl = await ptaxUsdAte(c.dia);
        if (usdBrl != null) { await gravar(c.dia, "MXNBRL", usdBrl * c.mxnUsd, "ptax_usd_x_ecb"); cruzadas++; }
        else if (c.mxnBrl != null) { await gravar(c.dia, "MXNBRL", c.mxnBrl, "ecb_direto"); diretas++; }
        else continue;
        gravados++;
      }
      mxnInfo = { janelaDias: dMxn, recebidas: cruz.length, cruzadas, diretas, ultima: cruz[cruz.length - 1]?.dia ?? null, fonte: cruzadas ? "ptax_usd_x_ecb" : diretas ? "ecb_direto" : null };
    } catch (e) {
      mxnInfo = { janelaDias: dMxn, erro: e instanceof Error ? e.message : String(e) };
    }
    detalhe.MXNBRL = mxnInfo;

    // 3) Vendas da Zenith que falharam por falta de câmbio entram agora
    try {
      const { reprocessarEventosZenith } = await import("./zenith-aplicar");
      const r = await reprocessarEventosZenith();
      if (r.tentados) detalhe.zenithReprocessados = { ok: r.ok, aindaComErro: r.aindaComErro };
    } catch (e) { detalhe.zenithReprocessamento = `falhou: ${e instanceof Error ? e.message : e}`; }
    if (typeof mxnInfo.erro === "string" && usd.length === 0) throw new Error(`PTAX e ECB falharam: ${mxnInfo.erro}`);
    return { registros: gravados, detalhe };
  });
}

/** Rótulo da fonte da taxa, para a tela. */
export const ROTULO_FONTE_CAMBIO: Record<string, string> = { ptax: "PTAX", ptax_usd_x_ecb: "PTAX USD × ECB MXN", ecb_direto: "ECB (MXN→BRL direto)", zenith: "Zenith", manual: "manual" };

/** Última taxa MXN gravada: dia e fonte (para o selo do painel). */
export async function ultimaTaxaMxnInfo(): Promise<{ dia: string; fonte: string; taxa: number } | null> {
  const [r] = await db.select().from(schema.cambio).where(eq(schema.cambio.par, "MXNBRL")).orderBy(desc(schema.cambio.dia)).limit(1);
  return r ? { dia: r.dia, fonte: r.fonte, taxa: Number(r.taxa) } : null;
}

export const _sql = sql;
export const ptaxCliente = clienteReal;
