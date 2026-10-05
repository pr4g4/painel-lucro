import { contextoPeriodo } from "@/lib/contexto";
import { resolverAtalho } from "@/lib/calculo";
import { dreFatiada } from "@/lib/fatias";
import { Suspense } from "react";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { Metrica, textoVariacao } from "@/components/metrica";
import { Secao } from "@/components/secao";
import { Sparkline } from "@/components/sparkline";
import { Grafico } from "@/components/grafico";
import { BotaoAtualizar } from "@/components/atualizar";
import { VisoesSalvas } from "@/components/visoes";
import { FaltaEmpatar, Projecao, GastoPorHora, TabelaNumeros } from "@/components/operacao";
import { CartoesCreditos } from "@/components/creditos";
import { carregarCreditos } from "@/coletores/creditos";
import { semaforoSaldo, coletaFalhando } from "@/lib/hoje";
import { faltaParaEmpatar, gastoPorNumero } from "@/lib/calculo";
import { fmtHora, fmtMoeda, fmtMXN, fmtHorasRestantes } from "@/lib/formato";
import { ROTULO_FONTE } from "@/coletores";
import { ultimaTaxaMxnInfo, ROTULO_FONTE_CAMBIO } from "@/coletores/cambio";
import type { Params } from "@/lib/periodo-url";

export const dynamic = "force-dynamic";

export default async function Painel({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado, atual, anterior, temBaseAnterior, coletas, taxaMxn } = ctx;
  const hojeP = resolverAtalho("hoje", estado.agora, estado.marcoZero, estado.tz).periodo;
  const hoje = ctx.calc(hojeP);
  const fatias = dreFatiada(ctx.entrada, estado.periodo, estado.gran, estado.tz);
  const [taxaMxnInfo, creditos] = await Promise.all([ultimaTaxaMxnInfo().catch(() => null), carregarCreditos(estado.agora, estado.tz).catch(() => null)]);
  const mesBruto = resolverAtalho("mes_atual", estado.agora, estado.marcoZero, estado.tz).periodo;
  const mesP = { inicio: new Date(Math.max(mesBruto.inicio.getTime(), estado.marcoZero.getTime())), fim: mesBruto.fim }; // mesma base do "desde o marco zero"
  const mes = ctx.calc(mesP);

  const t = atual.totais, a = anterior.totais, i = atual.indicadores, ia = anterior.indicadores;
  const d = { moeda: estado.moeda, taxaMxn };
  const money = (v: number | null | undefined) => fmtMoeda(v, estado.moeda, taxaMxn);
  const base = { ...d, temBase: temBaseAnterior };
  const dadosGrafico = fatias.map((f) => ({ rotulo: f.rotulo, receita: f.dre.totais.receitaLiquida, meta: f.dre.totais.metaComImposto, zapdata: f.dre.totais.zapdata, ia: f.dre.totais.ia, operacao: f.dre.totais.operacao, lucro: f.dre.totais.lucroLiquido }));
  const serieLucro = fatias.map((f) => f.dre.totais.lucroLiquido);
  const varLucro = textoVariacao(t.lucroLiquido, a.lucroLiquido, temBaseAnterior, "moeda", estado.moeda, taxaMxn);
  const atrasadas = [...coletas.entries()].filter(([f, c]) => f !== "zenith" && !c.naoConfigurada && (!c.ultimaOk || estado.agora.getTime() - c.ultimaOk.getTime() > 30 * 60_000));
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();
  const numeros = gastoPorNumero(ctx.entrada.lancamentos, estado.periodo, ctx.params, estado.incluirHistorico);
  const topNumero = Array.isArray(numeros) && numeros.length ? [...numeros].sort((x, y) => y.gasto - x.gasto)[0] : null;
  const falta = faltaParaEmpatar(hoje);
  const COR_SEM = { verde: "pos", amarelo: "text-warn", vermelho: "neg", cinza: "" } as const;
  const resumoCreditos = (() => {
    if (!creditos) return "dado indisponível";
    const itens = [["kie.ai", creditos.kie, "kie"], ["OpenAI", creditos.openai, "openai"]] as const;
    const comHoras = itens.filter(([, s]) => s.horasRestantes != null).sort((a, b) => a[1].horasRestantes! - b[1].horasRestantes!);
    if (!comHoras.length) return "sem estimativa de duração";
    const [nome, s, fonte] = comHoras[0];
    const sem = semaforoSaldo(s, coletaFalhando(coletas.get(fonte), estado.agora));
    return <span className={COR_SEM[sem]}>{nome} acaba em {fmtHorasRestantes(s.horasRestantes)}</span>;
  })();
  const cCambio = coletas.get("cambio"); const agendadorHa = cCambio ? Math.round((estado.agora.getTime() - cCambio.ultima.getTime()) / 60_000) : null;

  return (
    <>
      <Suspense fallback={<div className="h-12 skeleton" />}><SeletorPeriodo {...ctx.propsSeletor} semRotulo /></Suspense>
      <VisoesSalvas />
      {ctx.problemas.length > 0 && <div className="text-xs text-warn">{ctx.problemas.map((p, i) => <div key={i}>⚠ {p}</div>)}</div>}

      {/* destaque principal */}
      <section className="hero" aria-label="Lucro líquido do período">
        <div className="min-w-0">
          <div className="hero-k">Lucro líquido do período <span className="text-ink-3">· {ctx.propsSeletor.rotuloPeriodo}</span></div>
          <div className={`hero-v num ${t.lucroLiquido < 0 ? "neg" : t.lucroLiquido > 0 ? "pos" : ""}`}>{money(t.lucroLiquido)}</div>
          <div className="hero-sub num">
            {varLucro.texto && <span className={varLucro.bom == null ? "" : varLucro.bom ? "pos" : "neg"}>{varLucro.texto}<span className="text-ink-3"> ({ctx.propsSeletor.rotuloAnterior})</span></span>}
            <span>metade para cada sócio {money(t.porSocio)}</span>
          </div>
        </div>
        <div className="hero-lado">
          <Sparkline valores={serieLucro} largura={200} altura={48} />
          <span>lucro líquido por {estado.gran} · {fatias.length} pontos</span>
        </div>
      </section>

      {/* quatro números secundários, sem caixas */}
      <section className="secundarios" aria-label="Números do período">
        <Metrica rotulo="Receita líquida" valor={t.receitaLiquida} anterior={a.receitaLiquida} {...base} />
        <Metrica rotulo="Meta com imposto" valor={t.metaComImposto} anterior={a.metaComImposto} inverterSinal {...base} />
        <Metrica rotulo="IA (kie.ai + OpenAI)" valor={t.ia} anterior={a.ia} inverterSinal {...base} />
        <Metrica rotulo="Nº de vendas" valor={t.numVendas} anterior={a.numVendas} formato="int" temBase={temBaseAnterior} />
      </section>

      <Secao id="indicadores" titulo="Indicadores" resumo={`margem ${i.margemLiquida == null ? "—" : `${(i.margemLiquida * 100).toFixed(1)}%`} · ROAS ${i.roas == null ? "—" : `${i.roas.toFixed(2)}×`}`}>
        <div className="grade-metricas">
          {Math.abs(t.lucroBruto - t.lucroLiquido) >= 0.005 && <Metrica rotulo="Lucro bruto" valor={t.lucroBruto} anterior={a.lucroBruto} colorir {...base} />}
          <Metrica rotulo="Margem líquida" valor={i.margemLiquida} anterior={ia.margemLiquida} formato="pct" temBase={temBaseAnterior} />
          <Metrica rotulo="Ticket médio líquido" valor={i.ticketMedioLiquido} anterior={ia.ticketMedioLiquido} {...base} />
          <Metrica rotulo="Custo por venda" valor={i.custoPorVenda} anterior={ia.custoPorVenda} inverterSinal {...base} />
          <Metrica rotulo="ROAS" valor={i.roas} anterior={ia.roas} formato="razao" temBase={temBaseAnterior} nota={i.roas == null ? "sem receita no período" : undefined} />
          <Metrica rotulo="POAS" valor={i.poas} anterior={ia.poas} formato="razao" temBase={temBaseAnterior} nota={i.poas == null ? "sem receita no período" : undefined} />
          <Metrica rotulo="Imposto sobre lucro" valor={t.impostoLucro} anterior={a.impostoLucro} inverterSinal {...base} />
        </div>
      </Secao>

      <Secao id="custos" titulo="Custos detalhados" resumo={`total ${money(t.metaComImposto + t.zapdata + t.ia + t.operacao)}`}>
        <div className="grade-metricas">
          <Metrica rotulo="Meta com imposto" valor={t.metaComImposto} anterior={a.metaComImposto} inverterSinal {...base} />
          <Metrica rotulo="ZapData" valor={t.zapdata} anterior={a.zapdata} inverterSinal {...base} />
          <Metrica rotulo="IA (kie.ai + OpenAI)" valor={t.ia} anterior={a.ia} inverterSinal {...base} />
          <Metrica rotulo="Operação" valor={t.operacao} anterior={a.operacao} inverterSinal {...base} />
          <Metrica rotulo="Imposto sobre lucro" valor={t.impostoLucro} anterior={a.impostoLucro} inverterSinal {...base} />
          <Metrica rotulo="Reserva retida na Zenith" valor={t.reservaRetida} nota="não é custo · só venda nova" {...d} />
        </div>
        <p className="text-xs text-ink-3">Detalhe linha a linha na <a className="underline" href={`/dre?${query}`}>DRE</a> e por tipo em <a className="underline" href={`/custos?${query}`}>Custos por tipo</a>.</p>
      </Secao>

      <Secao id="vendas" titulo="Vendas e pendentes" resumo={`${t.numVendas} venda(s) · ${t.pendentesQtd} pendente(s)`}>
        <div className="grade-metricas">
          <Metrica rotulo="Nº de vendas" valor={t.numVendas} anterior={a.numVendas} formato="int" temBase={temBaseAnterior} />
          <Metrica rotulo="Receita bruta em MX$" texto={fmtMXN(t.receitaBrutaMxn)} valor={t.receitaBrutaMxn} anterior={a.receitaBrutaMxn} temBase={temBaseAnterior} formato="texto" />
          <Metrica rotulo="Receita líquida" valor={t.receitaLiquida} anterior={a.receitaLiquida} {...base} />
          <Metrica rotulo={`Vendas pendentes (${t.pendentesQtd})`} valor={t.pendentesValor} nota="fora da receita até aprovar" {...d} />
          <Metrica rotulo="Reserva retida na Zenith" valor={t.reservaRetida} nota="não é custo" {...d} />
          <Metrica rotulo="Ticket médio líquido" valor={i.ticketMedioLiquido} anterior={ia.ticketMedioLiquido} {...base} />
        </div>
      </Secao>

      <Secao id="numeros" titulo="Por número de WhatsApp" resumo={topNumero ? `maior gasto: ${topNumero.numero} ${money(topNumero.gasto)}` : "sem gasto no período"}>
        <TabelaNumeros lancamentos={ctx.entrada.lancamentos} periodo={estado.periodo} params={ctx.params} incluirHistorico={estado.incluirHistorico} {...d} />
      </Secao>

      <Secao id="graficos" titulo="Gráficos" resumo={`lucro por ${estado.gran} · ${fatias.length} pontos`}>
        <Grafico dados={dadosGrafico} titulo={`Receita líquida × custos empilhados + lucro líquido (por ${estado.gran})`} />
        <GastoPorHora lancamentos={ctx.entrada.lancamentos} periodo={estado.periodo} tz={estado.tz} params={ctx.params} incluirHistorico={estado.incluirHistorico} rotuloPeriodo={ctx.propsSeletor.rotuloPeriodo} {...d} />
        {estado.moeda === "MXN" && <p className="text-xs text-ink-3">Valores em MX$ convertidos de BRL pela última taxa MXN→BRL conhecida ({taxaMxn?.toFixed(4) ?? "—"}). Gráficos permanecem em R$.</p>}
      </Secao>

      <Secao id="projecao" titulo="Projeção e ponto de equilíbrio" resumo={falta.faltaReceita === 0 ? <span className="pos">hoje já está no lucro</span> : `falta ${money(falta.faltaReceita)} para empatar hoje`}>
        <div className="grade-metricas">
          <FaltaEmpatar hoje={hoje} {...d} />
          <Projecao mes={mes} agora={estado.agora} tz={estado.tz} marcoZero={estado.marcoZero} {...d} />
          <Metrica rotulo="Ponto de equilíbrio do período" valor={i.pontoEquilibrio} nota="receita líquida que falta para lucro bruto zero" {...d} />
          <Metrica rotulo="Lucro líquido no mês (desde o marco zero)" valor={mes.totais.lucroLiquido} colorir {...d} />
        </div>
      </Secao>

      <Secao id="creditos" titulo="Créditos das IAs" resumo={resumoCreditos}>
        <CartoesCreditos tz={estado.tz} agora={estado.agora} edita={ctx.sessao.papel === "edita"} dados={creditos} />
      </Secao>

      <Secao id="fontes" titulo="Fontes e atualização" resumo={agendadorHa == null ? "agendador nunca rodou" : `agendador há ${agendadorHa} min${atrasadas.length ? ` · ${atrasadas.length} fonte(s) atrasada(s)` : ""}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
          {["meta", "zenith", "cambio", "openai", "kie"].map((f) => {
            const c = coletas.get(f);
            const atras = !c?.ultimaOk || estado.agora.getTime() - c.ultimaOk.getTime() > 30 * 60_000;
            let texto = c?.naoConfigurada ? `sem chave (tentou ${fmtHora(c.ultima, estado.tz)})` : c?.ultimaOk ? fmtHora(c.ultimaOk, estado.tz) : c ? `falhou ${fmtHora(c.ultima, estado.tz)}` : "nunca";
            if (f === "cambio") texto += taxaMxnInfo ? ` · MXN ${taxaMxnInfo.taxa.toFixed(4)} (${ROTULO_FONTE_CAMBIO[taxaMxnInfo.fonte] ?? taxaMxnInfo.fonte}, ${taxaMxnInfo.dia.slice(8, 10)}/${taxaMxnInfo.dia.slice(5, 7)})` : " · sem taxa MXN";
            return <span key={f} className={`px-2 py-0.5 rounded-full border border-border num ${atras && f !== "zenith" && !c?.naoConfigurada ? "text-warn" : c?.naoConfigurada ? "text-ink-3" : ""}`} title={c?.erro ?? ""}>{ROTULO_FONTE[f]} {texto}{f === "zenith" && !c?.ultimaOk ? " (webhook/CSV)" : ""}</span>;
          })}
          <span className={`px-2 py-0.5 rounded-full border border-border ${agendadorHa == null || agendadorHa > 15 ? "text-warn" : "text-pos"}`} title="O agendador (pg_cron) chama a coleta a cada 10 min; o câmbio roda sempre, então ele é o batimento.">agendador: {agendadorHa == null ? "nunca rodou" : `há ${agendadorHa} min`}</span>
          <BotaoAtualizar />
          {atrasadas.length > 0 && <span className="text-warn">⚠ {atrasadas.length} fonte(s) desatualizada(s) há mais de 30 min; mantendo o último valor bom.</span>}
        </div>
      </Secao>

      {atual.avisos.length > 0 && <ul className="text-xs text-warn list-disc pl-5">{atual.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
    </>
  );
}
