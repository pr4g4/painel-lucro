import { contextoPeriodo } from "@/lib/contexto";
import { carregarLancamentos, carregarParametros } from "@/lib/dados";
import { anuncioComImposto } from "@/lib/calculo";
import { schema, executar } from "@/db";
import { Suspense } from "react";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { fmtMoeda, fmtPctSimples } from "@/lib/formato";
import type { Params } from "@/lib/periodo-url";
import { desc, eq, sql } from "drizzle-orm";
import { fmtNum } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function Campanhas({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado, taxaMxn } = ctx;
  const ultimaMeta = await executar((d) => d.select().from(schema.coletas).where(eq(schema.coletas.fonte, "meta")).orderBy(desc(schema.coletas.iniciadaEm)).limit(1), 10000, "última coleta Meta").then((r) => r[0]).catch(() => undefined);
  const [lanc, params, camps] = await Promise.all([carregarLancamentos(estado.periodo), carregarParametros(),
    executar((d) => d.select({ c: schema.campanhas, frente: schema.frentes.nome }).from(schema.campanhas).leftJoin(schema.frentes, eq(schema.frentes.id, schema.campanhas.frenteId)), 15000, "campanhas")]);
  // entrega (impressões e cliques) vem do payload da Meta; só para CTR, CPC e CPM
  const entrega = await executar((d) => d.execute(sql`select conta_id, campanha_id, coalesce(sum((payload->>'impressions')::numeric), 0)::float as impressoes, coalesce(sum((payload->>'clicks')::numeric), 0)::float as cliques
    from lancamentos where fonte in ('meta', 'tiktok') and tipo = 'gasto_anuncio' and instante >= ${estado.periodo.inicio} and instante < ${estado.periodo.fim} ${estado.incluirHistorico ? sql`` : sql`and historico = false`} group by 1, 2`), 15000, "entrega")
    .then((r) => new Map((r as unknown as { conta_id: string; campanha_id: string; impressoes: number; cliques: number }[]).map((x) => [`${x.conta_id}|${x.campanha_id}`, { impressoes: x.impressoes, cliques: x.cliques }]))).catch(() => new Map<string, { impressoes: number; cliques: number }>());
  const vendasAprovadas = ctx.atual.totais.numVendas;
  const gasto = new Map<string, number>();
  for (const l of lanc) {
    if ((l.fonte !== "meta" && l.fonte !== "tiktok") || (!estado.incluirHistorico && l.historico)) continue;
    const k = `${l.contaId}|${l.campanhaId}`;
    gasto.set(k, (gasto.get(k) ?? 0) + anuncioComImposto(l, params));
  }
  const linhas = camps.map(({ c, frente }) => { const k = `${c.contaId}|${c.campanhaId}`; const e = entrega.get(k) ?? { impressoes: 0, cliques: 0 }; return { ...c, frente, gasto: gasto.get(k) ?? 0, ...e }; }).sort((a, b) => b.gasto - a.gasto);
  const totImp = linhas.reduce((s, l) => s + l.impressoes, 0), totCli = linhas.reduce((s, l) => s + l.cliques, 0);
  const total = linhas.reduce((s, l) => s + l.gasto, 0);
  return (
    <>
      <Suspense fallback={<div className="card p-3 h-24 animate-pulse" />}><SeletorPeriodo {...ctx.propsSeletor} /></Suspense>
      <h1 className="font-semibold">Gerenciador de Ads <span className="text-xs text-ink-3 font-normal">gasto com imposto no período · total {fmtMoeda(total, estado.moeda, taxaMxn)}{totImp ? ` · ${fmtNum(totImp, 0)} impressões · CTR ${fmtPctSimples(totCli / totImp, 2)} · CPC ${fmtMoeda(total / Math.max(1, totCli), estado.moeda, taxaMxn)} · CPM ${fmtMoeda(total / totImp * 1000, estado.moeda, taxaMxn)}` : ""} · CPA geral {vendasAprovadas ? fmtMoeda(total / vendasAprovadas, estado.moeda, taxaMxn) : "—"}</span></h1>
      <p className="text-xs text-ink-3">Receita, lucro e ROAS por campanha não existem: a Zenith não diz de qual campanha veio a venda. O CPA geral usa as vendas aprovadas do período inteiro.</p>
      {ultimaMeta && (
        <div className="card p-3 text-xs text-ink-2">
          <b>Última coleta Meta</b> {ultimaMeta.iniciadaEm.toISOString().slice(11, 16)} UTC · {ultimaMeta.ok ? "ok" : `falhou: ${ultimaMeta.erro}`} ·{" "}
          {Object.entries((ultimaMeta.detalhe as Record<string, { linhas?: number; granularidade?: string; erro?: string }>) ?? {}).map(([conta, d]) => (
            <span key={conta} className="mr-3">{conta === process.env.META_ACT_00 ? "conta 00" : conta === process.env.META_ACT_01 ? "conta 01" : conta}: {d.erro ? <span className="neg">erro {d.erro}</span> : `${d.linhas ?? 0} linha(s) ${d.granularidade ?? ""}`}</span>
          ))}
          <span className="text-ink-3">(0 linhas sem erro = a Meta não retornou gasto nessa conta no período: campanhas pausadas ou sem veiculação)</span>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="tab">
          <thead><tr><th>Campanha</th><th>Conta</th><th>Número</th><th>Frente</th><th>Status</th><th className="text-right">Orçamento/dia</th><th className="text-right">Gasto c/ imposto</th><th className="text-right">% do total</th><th className="text-right">Impressões</th><th className="text-right">CTR</th><th className="text-right">CPC</th><th className="text-right">CPM</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td>{l.nome}</td><td className="text-xs text-ink-2">{l.contaId === process.env.META_ACT_00 ? "Meta 00" : l.contaId === process.env.META_ACT_01 ? "Meta 01" : l.contaId.startsWith("tiktok:") ? "TikTok" : l.contaId}</td>
                <td>{l.numeroWhatsapp ?? "—"}</td><td>{l.frente ?? <span className="text-ink-3">sem frente</span>}</td>
                <td><span className={`text-xs px-1.5 py-0.5 rounded-full border border-border ${l.status === "ACTIVE" ? "text-pos" : "text-ink-3"}`}>{l.status ?? "—"}</span></td>
                <td className="text-right num text-ink-2 whitespace-nowrap">{l.orcamentoDiario != null ? `${l.orcamentoMoeda ?? ""} ${fmtNum(Number(l.orcamentoDiario))}` : "—"}</td>
                <td className="text-right num">{fmtMoeda(l.gasto, estado.moeda, taxaMxn)}</td><td className="text-right num text-ink-2">{total ? fmtPctSimples(l.gasto / total) : "—"}</td>
                <td className="text-right num text-ink-2">{l.impressoes ? fmtNum(l.impressoes, 0) : "—"}</td>
                <td className="text-right num text-ink-2">{l.impressoes ? fmtPctSimples(l.cliques / l.impressoes, 2) : "—"}</td>
                <td className="text-right num text-ink-2">{l.cliques ? fmtMoeda(l.gasto / l.cliques, estado.moeda, taxaMxn) : "—"}</td>
                <td className="text-right num text-ink-2">{l.impressoes ? fmtMoeda(l.gasto / l.impressoes * 1000, estado.moeda, taxaMxn) : "—"}</td>
              </tr>
            ))}
            {linhas.length === 0 && <tr><td colSpan={12} className="text-ink-3">Nenhuma campanha coletada ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
