import { contextoPeriodo } from "@/lib/contexto";
import { carregarLancamentos, carregarParametros } from "@/lib/dados";
import { fatorImpostoMeta, numeroVigente } from "@/lib/calculo";
import { schema, executar } from "@/db";
import { Suspense } from "react";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { fmtMoeda, fmtPctSimples } from "@/lib/formato";
import type { Params } from "@/lib/periodo-url";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function Campanhas({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado, taxaMxn } = ctx;
  const ultimaMeta = await executar((d) => d.select().from(schema.coletas).where(eq(schema.coletas.fonte, "meta")).orderBy(desc(schema.coletas.iniciadaEm)).limit(1), 10000, "última coleta Meta").then((r) => r[0]).catch(() => undefined);
  const [lanc, params, camps] = await Promise.all([carregarLancamentos(estado.periodo), carregarParametros(),
    executar((d) => d.select({ c: schema.campanhas, frente: schema.frentes.nome }).from(schema.campanhas).leftJoin(schema.frentes, eq(schema.frentes.id, schema.campanhas.frenteId)), 15000, "campanhas")]);
  const gasto = new Map<string, number>();
  for (const l of lanc) {
    if (l.fonte !== "meta" || (!estado.incluirHistorico && l.historico)) continue;
    const k = `${l.contaId}|${l.campanhaId}`;
    gasto.set(k, (gasto.get(k) ?? 0) + l.valorBrl * fatorImpostoMeta(numeroVigente(params, "imposto_meta_pct", l.instante)));
  }
  const linhas = camps.map(({ c, frente }) => ({ ...c, frente, gasto: gasto.get(`${c.contaId}|${c.campanhaId}`) ?? 0 })).sort((a, b) => b.gasto - a.gasto);
  const total = linhas.reduce((s, l) => s + l.gasto, 0);
  return (
    <>
      <Suspense fallback={<div className="card p-3 h-24 animate-pulse" />}><SeletorPeriodo {...ctx.propsSeletor} /></Suspense>
      <h1 className="font-semibold">Campanhas <span className="text-xs text-ink-3 font-normal">gasto com imposto no período · total {fmtMoeda(total, estado.moeda, taxaMxn)} · sem ROAS por campanha na fase 1</span></h1>
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
          <thead><tr><th>Campanha</th><th>Conta</th><th>Número</th><th>Frente</th><th>Status</th><th className="text-right">Gasto c/ imposto</th><th className="text-right">% do total</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td>{l.nome}</td><td className="text-xs text-ink-2">{l.contaId === process.env.META_ACT_00 ? "00" : l.contaId === process.env.META_ACT_01 ? "01" : l.contaId}</td>
                <td>{l.numeroWhatsapp ?? "—"}</td><td>{l.frente ?? <span className="text-ink-3">sem frente</span>}</td>
                <td><span className={`text-xs px-1.5 py-0.5 rounded-full border border-border ${l.status === "ACTIVE" ? "text-pos" : "text-ink-3"}`}>{l.status ?? "—"}</span></td>
                <td className="text-right num">{fmtMoeda(l.gasto, estado.moeda, taxaMxn)}</td><td className="text-right num text-ink-2">{total ? fmtPctSimples(l.gasto / total) : "—"}</td>
              </tr>
            ))}
            {linhas.length === 0 && <tr><td colSpan={7} className="text-ink-3">Nenhuma campanha coletada ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
