import { contextoPeriodo } from "@/lib/contexto";
import { Suspense } from "react";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { fmtMoeda } from "@/lib/formato";
import type { Params } from "@/lib/periodo-url";

export const dynamic = "force-dynamic";

export default async function Produtos({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado, atual, taxaMxn } = ctx;
  return (
    <>
      <Suspense fallback={<div className="card p-3 h-24 animate-pulse" />}><SeletorPeriodo {...ctx.propsSeletor} /></Suspense>
      <h1 className="font-semibold">Vendas por produto <span className="text-xs text-ink-3 font-normal">só com o produto informado pela fonte; nunca adivinhado pelo valor</span></h1>
      {atual.porProduto ? (
        <div className="card overflow-x-auto"><table className="tab">
          <thead><tr><th>Produto</th><th className="text-right">Vendas</th><th className="text-right">Receita líquida</th><th className="text-right">Ticket médio líq.</th><th className="text-right">% da receita</th></tr></thead>
          <tbody>{atual.porProduto.map((p) => <tr key={p.produto}><td>{p.produto}</td><td className="text-right num">{p.qtd}</td><td className="text-right num">{fmtMoeda(p.receitaLiquida, estado.moeda, taxaMxn)}</td><td className="text-right num">{fmtMoeda(p.ticketMedio, estado.moeda, taxaMxn)}</td><td className="text-right num">{atual.totais.receitaLiquida ? `${(p.receitaLiquida / atual.totais.receitaLiquida * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody>
        </table></div>
      ) : <div className="card p-4 text-ink-2">Dado indisponível: {atual.porProdutoIndisponivel}.</div>}
      {atual.avisos.filter((a) => a.includes("produto")).map((a, i) => <p key={i} className="text-xs text-warn">{a}</p>)}
    </>
  );
}
