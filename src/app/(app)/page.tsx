import { contextoPeriodo } from "@/lib/contexto";
import { resolverAtalho, periodoAnterior } from "@/lib/calculo";
import { dreFatiada } from "@/lib/fatias";
import { Suspense } from "react";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { Cartao } from "@/components/cartao";
import { Grafico } from "@/components/grafico";
import { BotaoAtualizar } from "@/components/atualizar";
import { VisoesSalvas } from "@/components/visoes";
import { BlocoOperacao } from "@/components/operacao";
import { CartoesCreditos } from "@/components/creditos";
import { fmtHora, fmtMoeda, fmtMXN } from "@/lib/formato";
import { ROTULO_FONTE } from "@/coletores";
import { ultimaTaxaMxnInfo, ROTULO_FONTE_CAMBIO } from "@/coletores/cambio";
import type { Params } from "@/lib/periodo-url";
import type { ResultadoDRE } from "@/lib/calculo";

export const dynamic = "force-dynamic";

export default async function Painel({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado, atual, anterior, temBaseAnterior, coletas, taxaMxn } = ctx;
  const hojeP = resolverAtalho("hoje", estado.agora, estado.marcoZero, estado.tz).periodo;
  const hojeAnt = periodoAnterior(hojeP, estado.tz);
  const hoje = { atual: ctx.calc(hojeP), anterior: ctx.calc(hojeAnt), temBaseAnterior: ctx.temDados(hojeAnt) };
  const fatias = dreFatiada(ctx.entrada, estado.periodo, estado.gran, estado.tz);
  const taxaMxnInfo = await ultimaTaxaMxnInfo().catch(() => null);
  const mesBruto = resolverAtalho("mes_atual", estado.agora, estado.marcoZero, estado.tz).periodo;
  const mesP = { inicio: new Date(Math.max(mesBruto.inicio.getTime(), estado.marcoZero.getTime())), fim: mesBruto.fim }; // mesma base do "desde o marco zero"
  const mes = ctx.calc(mesP);

  const dadosGrafico = fatias.map((f) => ({ rotulo: f.rotulo, receita: f.dre.totais.receitaLiquida, meta: f.dre.totais.metaComImposto, zapdata: f.dre.totais.zapdata, ia: f.dre.totais.ia, operacao: f.dre.totais.operacao, lucro: f.dre.totais.lucroLiquido }));
  const atrasadas = [...coletas.entries()].filter(([f, c]) => f !== "zenith" && !c.naoConfigurada && (!c.ultimaOk || estado.agora.getTime() - c.ultimaOk.getTime() > 30 * 60_000));

  return (
    <>
      <Suspense fallback={<div className="card p-3 h-24 animate-pulse" />}><SeletorPeriodo {...ctx.propsSeletor} /></Suspense>
      {ctx.problemas.length > 0 && <div className="card p-2 text-xs text-warn border-warn">{ctx.problemas.map((p, i) => <div key={i}>⚠ {p}</div>)}</div>}
      <CartoesCreditos tz={estado.tz} agora={estado.agora} edita={ctx.sessao.papel === "edita"} />
      <VisoesSalvas />
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
        <span>Atualizado:</span>
        {["meta", "zenith", "cambio", "openai", "kie"].map((f) => {
          const c = coletas.get(f);
          const atras = !c?.ultimaOk || estado.agora.getTime() - c.ultimaOk.getTime() > 30 * 60_000;
          let texto = c?.naoConfigurada ? `sem chave (tentou ${fmtHora(c.ultima, estado.tz)})` : c?.ultimaOk ? fmtHora(c.ultimaOk, estado.tz) : c ? `falhou ${fmtHora(c.ultima, estado.tz)}` : "nunca";
          if (f === "cambio") texto += taxaMxnInfo ? ` · MXN ${taxaMxnInfo.taxa.toFixed(4)} (${ROTULO_FONTE_CAMBIO[taxaMxnInfo.fonte] ?? taxaMxnInfo.fonte}, ${taxaMxnInfo.dia.slice(8, 10)}/${taxaMxnInfo.dia.slice(5, 7)})` : " · sem taxa MXN";
          return <span key={f} className={`px-2 py-0.5 rounded-full border border-border ${atras && f !== "zenith" && !c?.naoConfigurada ? "text-warn" : c?.naoConfigurada ? "text-ink-3" : ""}`} title={c?.erro ?? ""}>{ROTULO_FONTE[f]} {texto}{f === "zenith" && !c?.ultimaOk ? " (webhook/CSV)" : ""}</span>;
        })}
        {(() => { const c = coletas.get("cambio"); const ha = c ? Math.round((estado.agora.getTime() - c.ultima.getTime()) / 60_000) : null; return <span className={`px-2 py-0.5 rounded-full border border-border ${ha == null || ha > 15 ? "text-warn" : "text-pos"}`} title="O agendador (pg_cron) chama a coleta a cada 10 min; o câmbio roda sempre, então ele é o batimento.">agendador: {ha == null ? "nunca rodou" : `há ${ha} min`}</span>; })()}
        <BotaoAtualizar />
        {atrasadas.length > 0 && <span className="text-warn">⚠ {atrasadas.length} fonte(s) desatualizada(s) há mais de 30 min; mantendo o último valor bom.</span>}
      </div>

      <Bloco titulo="Hoje" sub="vs. ontem até a mesma hora" dre={hoje.atual} ant={hoje.anterior} temBase={hoje.temBaseAnterior} moeda={estado.moeda} taxaMxn={taxaMxn} />
      <BlocoOperacao hoje={hoje.atual} mes={mes} agora={estado.agora} tz={estado.tz} marcoZero={estado.marcoZero} moeda={estado.moeda} taxaMxn={taxaMxn} lancamentos={ctx.entrada.lancamentos} periodo={estado.periodo} params={ctx.params} incluirHistorico={estado.incluirHistorico} rotuloPeriodo={ctx.propsSeletor.rotuloPeriodo} />
      <Bloco titulo="Período selecionado" sub={ctx.propsSeletor.rotuloPeriodo} dre={atual} ant={anterior} temBase={temBaseAnterior} moeda={estado.moeda} taxaMxn={taxaMxn} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Cartao rotulo="Reserva retida na Zenith (só venda nova)" valor={atual.totais.reservaRetida} temBase={false} moeda={estado.moeda} taxaMxn={taxaMxn} nota="não é custo" />
        <Cartao rotulo={`Vendas pendentes (${atual.totais.pendentesQtd})`} valor={atual.totais.pendentesValor} temBase={false} moeda={estado.moeda} taxaMxn={taxaMxn} nota="fora da receita" />
        <Cartao rotulo="Ponto de equilíbrio (falta de receita líq.)" valor={atual.indicadores.pontoEquilibrio} temBase={false} moeda={estado.moeda} taxaMxn={taxaMxn} />
        <Cartao rotulo="Receita bruta em MX$" texto={fmtMXN(atual.totais.receitaBrutaMxn)} valor={atual.totais.receitaBrutaMxn} anterior={anterior.totais.receitaBrutaMxn} temBase={temBaseAnterior} formato="texto" />
      </div>

      <Grafico dados={dadosGrafico} titulo={`Receita líquida × custos empilhados + lucro líquido (por ${estado.gran})`} />
      {estado.moeda === "MXN" && <p className="text-xs text-ink-3">Valores em MX$ convertidos de BRL pela última taxa MXN→BRL conhecida ({taxaMxn?.toFixed(4) ?? "—"}). Gráfico permanece em R$.</p>}
      {atual.avisos.length > 0 && <ul className="text-xs text-warn list-disc pl-5">{atual.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
    </>
  );
}

function Bloco({ titulo, sub, dre, ant, temBase, moeda, taxaMxn }: { titulo: string; sub: string; dre: ResultadoDRE; ant: ResultadoDRE; temBase: boolean; moeda: "BRL" | "MXN"; taxaMxn: number | null }) {
  const t = dre.totais, a = ant.totais, i = dre.indicadores, ia = ant.indicadores;
  const m = { moeda, taxaMxn, temBase };
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">{titulo} <span className="text-xs text-ink-3 font-normal">{sub}</span></h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <div className="col-span-2 sm:col-span-3 lg:col-span-2"><Cartao rotulo="Lucro líquido" valor={t.lucroLiquido} anterior={a.lucroLiquido} hero {...m} /></div>
        <Cartao rotulo="Metade para cada sócio" valor={t.porSocio} anterior={a.porSocio} destaque {...m} />
        <Cartao rotulo="Receita líquida" valor={t.receitaLiquida} anterior={a.receitaLiquida} {...m} />
        <Cartao rotulo="Lucro bruto" valor={t.lucroBruto} anterior={a.lucroBruto} {...m} />
        <Cartao rotulo="Imposto sobre lucro" valor={t.impostoLucro} anterior={a.impostoLucro} inverterSinal {...m} />
        <Cartao rotulo="Nº de vendas" valor={t.numVendas} anterior={a.numVendas} formato="int" temBase={temBase} />
        <Cartao rotulo="Meta com imposto" valor={t.metaComImposto} anterior={a.metaComImposto} inverterSinal {...m} />
        <Cartao rotulo="ZapData" valor={t.zapdata} anterior={a.zapdata} inverterSinal {...m} />
        <Cartao rotulo="IA (kie.ai + OpenAI)" valor={t.ia} anterior={a.ia} inverterSinal {...m} />
        <Cartao rotulo="Operação" valor={t.operacao} anterior={a.operacao} inverterSinal {...m} />
        <Cartao rotulo="Ticket médio líquido" valor={i.ticketMedioLiquido} anterior={ia.ticketMedioLiquido} {...m} />
        <Cartao rotulo="Custo por venda" valor={i.custoPorVenda} anterior={ia.custoPorVenda} inverterSinal {...m} />
        <Cartao rotulo="ROAS" valor={i.roas} anterior={ia.roas} formato="razao" temBase={temBase} />
        <Cartao rotulo="POAS" valor={i.poas} anterior={ia.poas} formato="razao" temBase={temBase} />
        <Cartao rotulo="Margem líquida" valor={i.margemLiquida} anterior={ia.margemLiquida} formato="pct" temBase={temBase} />
      </div>
    </section>
  );
}

export const _f = fmtMoeda;
