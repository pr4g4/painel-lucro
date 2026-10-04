import { contextoPeriodo } from "@/lib/contexto";
import { resolverAtalho, periodoAnterior } from "@/lib/calculo";
import { Cartao } from "@/components/cartao";
import { fmtHora } from "@/lib/formato";
import type { Params } from "@/lib/periodo-url";

export const dynamic = "force-dynamic";

/** Uma tela só, para ver no celular: lucro de hoje, do mês e o que falta para empatar. */
export default async function Resumo({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo({ ...sp, p: "mes_atual" });
  const { estado, coletas, taxaMxn } = ctx;
  const hojeP = resolverAtalho("hoje", estado.agora, estado.marcoZero, estado.tz).periodo;
  const hoje = ctx.calc(hojeP), hojeAnt = ctx.calc(periodoAnterior(hojeP, estado.tz));
  const mes = ctx.atual;
  const m = { moeda: estado.moeda, taxaMxn };
  return (
    <>
      <h1 className="font-semibold text-lg">Resumo <span className="text-xs text-ink-3 font-normal">hoje e mês atual · atualizado {fmtHora(coletas.get("meta")?.ultimaOk ?? null, estado.tz)}</span></h1>
      <div className="grid grid-cols-2 gap-2">
        <Cartao rotulo="Lucro líquido hoje" valor={hoje.totais.lucroLiquido} anterior={hojeAnt.totais.lucroLiquido} temBase={ctx.temDados(periodoAnterior(hojeP, estado.tz))} destaque {...m} />
        <Cartao rotulo="Lucro líquido no mês" valor={mes.totais.lucroLiquido} temBase={false} destaque {...m} />
        <Cartao rotulo="Vendas hoje" valor={hoje.totais.numVendas} formato="int" temBase={false} />
        <Cartao rotulo="Receita líquida hoje" valor={hoje.totais.receitaLiquida} temBase={false} {...m} />
        <Cartao rotulo="Meta com imposto hoje" valor={hoje.totais.metaComImposto} temBase={false} {...m} />
        <Cartao rotulo="Falta vender hoje para empatar" valor={hoje.indicadores.pontoEquilibrio} temBase={false} {...m} nota={hoje.indicadores.pontoEquilibrio === 0 ? "já está no lucro" : undefined} />
      </div>
    </>
  );
}
