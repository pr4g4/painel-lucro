/**
 * Câmbio USD→BRL e MXN→BRL pela PTAX (Banco Central, API Olinda).
 * Uma taxa por dia; fim de semana/feriado usa a última anterior (resolvido na leitura, não na gravação).
 * A taxa do dia corrente sai ~13h15; até lá gravamos a do dia útil anterior como "provisória" e trocamos quando sair.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { executarColeta, diaBrasilia } from "./base";

export type CotacaoDia = { dia: string; taxa: number }; // dia = AAAA-MM-DD
export interface CambioCliente {
  cotacoes(par: "USDBRL" | "MXNBRL", deDia: string, ateDia: string): Promise<CotacaoDia[]>;
}

const PTAX = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";
const fmtPtax = (d: string) => { const [a, m, dd] = d.split("-"); return `${m}-${dd}-${a}`; };

export const ptaxCliente: CambioCliente = {
  async cotacoes(par, deDia, ateDia) {
    const url = par === "USDBRL"
      ? `${PTAX}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${fmtPtax(deDia)}'&@dataFinalCotacao='${fmtPtax(ateDia)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`
      : `${PTAX}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='MXN'&@dataInicial='${fmtPtax(deDia)}'&@dataFinalCotacao='${fmtPtax(ateDia)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao,tipoBoletim`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`PTAX ${par} HTTP ${r.status}`);
    const j = (await r.json()) as { value: { cotacaoVenda: number; dataHoraCotacao: string; tipoBoletim?: string }[] };
    // Para moedas o PTAX traz vários boletins por dia (Abertura, Intermediário, Fechamento/"Fechamento PTAX"):
    // preferimos o que contém "Fechamento"; sem ele, fica o último do dia. Nunca deixar o dia sem taxa por causa do nome.
    const porDia = new Map<string, { taxa: number; fechamento: boolean }>();
    for (const v of j.value) {
      const dia = v.dataHoraCotacao.slice(0, 10);
      const fechamento = !v.tipoBoletim || /fechamento/i.test(v.tipoBoletim);
      const atual = porDia.get(dia);
      if (!atual || fechamento || !atual.fechamento) porDia.set(dia, { taxa: v.cotacaoVenda, fechamento });
    }
    return [...porDia.entries()].map(([dia, x]) => ({ dia, taxa: x.taxa })).sort((a, b) => a.dia.localeCompare(b.dia));
    // (linha abaixo mantida só para o tipo)
    // eslint-disable-next-line no-unreachable
  },
};

export async function coletarCambio(cliente: CambioCliente = ptaxCliente, agora = new Date()) {
  return executarColeta("cambio", async () => {
    const hoje = diaBrasilia(agora);
    let gravados = 0;
    const detalhe: Record<string, unknown> = {};
    for (const par of ["USDBRL", "MXNBRL"] as const) {
      // Janela normal: 15 dias. Se ainda não houver NENHUMA taxa deste par (ex.: primeira coleta num fim de semana), busca 45 dias
      // para garantir pelo menos um dia útil, pois a leitura usa "última taxa até a data".
      const [existe] = await db.select({ dia: schema.cambio.dia }).from(schema.cambio).where(eq(schema.cambio.par, par)).limit(1);
      const dias = existe ? 15 : 45;
      const de = diaBrasilia(new Date(agora.getTime() - dias * 86_400_000));
      const cot = await cliente.cotacoes(par, de, hoje);
      detalhe[par] = { janelaDias: dias, recebidas: cot.length, ultima: cot[cot.length - 1]?.dia ?? null };
      for (const c of cot) {
        await db.insert(schema.cambio).values({ dia: c.dia, par, taxa: String(c.taxa), fonte: "ptax", provisoria: false })
          .onConflictDoUpdate({ target: [schema.cambio.dia, schema.cambio.par], set: { taxa: String(c.taxa), provisoria: false, fonte: "ptax", coletadoEm: new Date() } });
        gravados++;
      }
      // Hoje ainda sem boletim: grava provisória com a última conhecida (se não existir linha definitiva)
      if (!cot.some((c) => c.dia === hoje) && cot.length) {
        const ultima = cot[cot.length - 1];
        const [existe] = await db.select().from(schema.cambio).where(and(eq(schema.cambio.dia, hoje), eq(schema.cambio.par, par))).limit(1);
        if (!existe) await db.insert(schema.cambio).values({ dia: hoje, par, taxa: String(ultima.taxa), fonte: "ptax", provisoria: true });
      }
    }
    // Vendas da Zenith que falharam por falta de câmbio entram agora
    try {
      const { reprocessarEventosZenith } = await import("./zenith-aplicar");
      const r = await reprocessarEventosZenith();
      if (r.tentados) detalhe.zenithReprocessados = { ok: r.ok, aindaComErro: r.aindaComErro };
    } catch (e) { detalhe.zenithReprocessamento = `falhou: ${e instanceof Error ? e.message : e}`; }
    return { registros: gravados, detalhe };
  });
}

/** Backfill de dias sem taxa (feriados) não é necessário: a leitura usa a última anterior. */
export const _sql = sql;
