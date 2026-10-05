import { contextoPeriodo } from "@/lib/contexto";
import { resolverAtalho, periodoAnterior } from "@/lib/calculo";
import { Cartao } from "@/components/cartao";
import { CartoesCreditos } from "@/components/creditos";
import { faltaParaEmpatar, projecaoMes } from "@/lib/calculo";
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
  const mes = ctx.calc({ inicio: new Date(Math.max(estado.periodo.inicio.getTime(), estado.marcoZero.getTime())), fim: estado.periodo.fim }); // mês atual desde o marco zero
  const m = { moeda: estado.moeda, taxaMxn };
  const f = faltaParaEmpatar(hoje);
  const proj = projecaoMes(mes, estado.agora, estado.tz, estado.marcoZero);
  const fontes = ["meta", "zenith"].map((k) => `${k === "meta" ? "Meta" : "Zenith"} ${fmtHora(coletas.get(k)?.ultimaOk ?? null, estado.tz)}`).join(" · ");
  return (
    <>
      <h1 className="font-semibold">Resumo <span className="text-xs text-ink-3 font-normal">hoje e mês atual · {fontes}</span></h1>
      <CartoesCreditos tz={estado.tz} agora={estado.agora} edita={ctx.sessao.papel === "edita"} />
      <Cartao rotulo="Lucro líquido hoje" valor={hoje.totais.lucroLiquido} anterior={hojeAnt.totais.lucroLiquido} temBase={ctx.temDados(periodoAnterior(hojeP, estado.tz))} hero {...m} />
      <div className="grid grid-cols-2 gap-2">
        <Cartao rotulo="Metade para cada sócio (hoje)" valor={hoje.totais.porSocio} anterior={hojeAnt.totais.porSocio} temBase={ctx.temDados(periodoAnterior(hojeP, estado.tz))} destaque {...m} />
        <Cartao rotulo="Lucro líquido no mês (desde o marco zero)" valor={mes.totais.lucroLiquido} temBase={false} destaque {...m} />
        <Cartao rotulo="Vendas hoje" valor={hoje.totais.numVendas} formato="int" temBase={false} />
        <Cartao rotulo="Receita líquida hoje" valor={hoje.totais.receitaLiquida} temBase={false} {...m} />
        <Cartao rotulo="Meta com imposto hoje" valor={hoje.totais.metaComImposto} temBase={false} {...m} />
        <Cartao rotulo="Falta vender hoje para empatar" valor={f.faltaReceita} temBase={false} {...m} nota={f.faltaReceita === 0 ? "já está no lucro" : f.vendasNecessarias != null ? `≈ ${f.vendasNecessarias} venda(s)` : "nº de vendas indisponível"} />
        <Cartao rotulo="Projeção do mês (ritmo atual)" valor={"indisponivel" in proj ? null : proj.lucroLiquido} temBase={false} {...m} indisponivel={"indisponivel" in proj ? proj.indisponivel : undefined} />
        <Cartao rotulo="Vendas pendentes" valor={hoje.totais.pendentesValor} temBase={false} {...m} nota={`${hoje.totais.pendentesQtd} fora da receita`} />
      </div>
      <p className="text-xs text-ink-3">Tudo em {estado.moeda} · fuso {estado.tz === "America/Mexico_City" ? "México" : "Brasília"}. Reembolsos entram na data do reembolso; pendentes ficam fora até aprovar.</p>
    </>
  );
}
