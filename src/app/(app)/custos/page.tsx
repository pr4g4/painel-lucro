import { contextoPeriodo } from "@/lib/contexto";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { fmtMoeda, fmtPctSimples } from "@/lib/formato";
import type { Params } from "@/lib/periodo-url";

export const dynamic = "force-dynamic";

export default async function Custos({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado, atual, anterior, temBaseAnterior, taxaMxn } = ctx;
  const t = atual.totais, a = anterior.totais;
  const meta = atual.linhas.find((l) => l.chave === "meta_com_imposto");
  const op = atual.linhas.find((l) => l.chave === "operacao");
  const itens: { nome: string; valor: number; ant: number | null; filhos?: { nome: string; valor: number }[] }[] = [
    { nome: "Meta com imposto", valor: t.metaComImposto, ant: a.metaComImposto, filhos: meta?.filhos?.map((f) => ({ nome: f.rotulo, valor: -f.valor })) },
    { nome: "ZapData diluído", valor: t.zapdata, ant: a.zapdata },
    { nome: "IA", valor: t.ia, ant: a.ia, filhos: [{ nome: "kie.ai", valor: t.iaKie }, { nome: "OpenAI", valor: t.iaOpenai }] },
    { nome: "Operação (por categoria)", valor: t.operacao, ant: a.operacao, filhos: op?.filhos?.map((f) => ({ nome: f.rotulo, valor: -f.valor })) },
  ];
  const total = t.custosTotais;
  return (
    <>
      <SeletorPeriodo {...ctx.propsSeletor} />
      <h1 className="font-semibold">Custos por tipo <span className="text-xs text-ink-3 font-normal">total {fmtMoeda(total, estado.moeda, taxaMxn)} no período</span></h1>
      <div className="card overflow-x-auto">
        <table className="tab">
          <thead><tr><th>Tipo</th><th className="text-right">Valor</th><th className="text-right">% dos custos</th><th className="text-right">% da receita líq.</th><th className="text-right">vs. anterior</th></tr></thead>
          <tbody>
            {itens.flatMap((i) => [
              <tr key={i.nome} className="font-semibold"><td>{i.nome}</td><td className="text-right num">{fmtMoeda(i.valor, estado.moeda, taxaMxn)}</td><td className="text-right num">{total ? fmtPctSimples(i.valor / total) : "—"}</td><td className="text-right num">{t.receitaLiquida ? fmtPctSimples(i.valor / t.receitaLiquida) : "—"}</td>
                <td className="text-right num text-xs">{!temBaseAnterior || i.ant == null ? <span className="text-ink-3">sem base</span> : <span className={i.valor - i.ant <= 0 ? "text-pos" : "text-neg"}>{i.valor - i.ant >= 0 ? "+" : ""}{fmtMoeda(i.valor - i.ant, estado.moeda, taxaMxn)}</span>}</td></tr>,
              ...(i.filhos ?? []).map((f) => <tr key={i.nome + f.nome} className="text-ink-2"><td className="pl-8">{f.nome}</td><td className="text-right num">{fmtMoeda(f.valor, estado.moeda, taxaMxn)}</td><td className="text-right num">{total ? fmtPctSimples(f.valor / total) : "—"}</td><td></td><td></td></tr>),
            ])}
          </tbody>
        </table>
      </div>
    </>
  );
}
