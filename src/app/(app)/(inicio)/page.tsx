import { Suspense } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { contextoPeriodo } from "@/lib/contexto";
import { lucroAcumulado, alertaSaldo, resolverAtalho } from "@/lib/calculo";
import { carregarCreditos } from "@/coletores/creditos";
import { avisosAbertos } from "@/lib/dados";
import { fontesAtrasadas } from "@/lib/hoje";
import { diaBrasilia } from "@/coletores/base";
import { fmtMoeda, fmtUSD, fmtHorasRestantes } from "@/lib/formato";
import { SeletorCompacto } from "@/components/seletor-compacto";
import { NumeroAnimado } from "@/components/numero-animado";
import { StatusLinha } from "@/components/status-linha";
import { AreaAcumulado } from "@/components/area-acumulado";
import { Vivo } from "@/components/vivo";
import { Entretem } from "@/components/entretem";
import { FaixaAtraso } from "@/components/faixa-atraso";
import { textoVariacao } from "@/components/metrica";
import type { Params } from "@/lib/periodo-url";

export const dynamic = "force-dynamic";

/** Página inicial: só o essencial. Tudo o mais fica em /detalhes (mesmos números). */
export default async function Inicio({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado, atual, anterior, temBaseAnterior, coletas, taxaMxn } = ctx;
  const [creditos, avisosAb] = await Promise.all([carregarCreditos(estado.agora, estado.tz).catch(() => null), avisosAbertos().catch(() => [])]);
  const t = atual.totais, a = anterior.totais;
  const money = (v: number | null | undefined) => fmtMoeda(v, estado.moeda, taxaMxn);
  const prefixo = estado.moeda === "MXN" ? "MX$ " : "R$ ";
  const emMoeda = (v: number) => (estado.moeda === "MXN" && taxaMxn ? v / taxaMxn : v);
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();

  const atrasos = fontesAtrasadas(coletas, estado.agora, avisosAb.some((x) => x.tipo === "webhook_rejeitado"));
  const periodoTocaHoje = estado.periodo.fim.getTime() > estado.agora.getTime() - 60 * 60_000;
  const incompleto = periodoTocaHoje && atrasos.some((x) => x.fonte === "meta" || x.fonte === "zenith");
  const varLucro = textoVariacao(t.lucroLiquido, a.lucroLiquido, temBaseAnterior, "moeda", estado.moeda, taxaMxn);
  const acum = lucroAcumulado(ctx.entrada, estado.periodo, estado.tz);
  // rótulo do fim: "24h" quando o período fecha à meia-noite (Ontem), senão a hora/dia do fim
  const fimH = formatInTimeZone(estado.periodo.fim, estado.tz, "HH:mm");
  const rotuloFim = acum.gran === "hora" ? (fimH === "00:00" ? "24h" : formatInTimeZone(estado.periodo.fim, estado.tz, "HH'h'")) : formatInTimeZone(new Date(estado.periodo.fim.getTime() - 1), estado.tz, "dd/MM");
  const hoje = estado.atalho === "hoje" ? atual : ctx.calc(resolverAtalho("hoje", estado.agora, estado.marcoZero, estado.tz).periodo); // estado de hoje para o "vivo"
  const ultimaOk = ["meta", "cambio", "openai", "kie"].map((f) => coletas.get(f)?.ultimaOk?.getTime() ?? 0).reduce((m, x) => Math.max(m, x), 0);
  const cambio = coletas.get("cambio");
  const agendadorOk = !!cambio && estado.agora.getTime() - cambio.ultima.getTime() <= 15 * 60_000;
  const chipsSaldo = creditos ? [creditos.kie, creditos.openai].flatMap((s) => { const m = alertaSaldo(s, creditos.limites); return m ? [{ nome: s.fonte === "kie" ? "kie.ai" : "OpenAI", texto: `${fmtUSD(s.saldoUsd)}${s.horasRestantes != null ? ` · ${fmtHorasRestantes(s.horasRestantes)}` : ""}`, motivo: m }] : []; }) : [];
  const bloco = (chave: string, rotulo: string, valor: number, ant: number, inverter = false, inteiro = false) => {
    const v = textoVariacao(valor, ant, temBaseAnterior, inteiro ? "int" : "moeda", estado.moeda, taxaMxn);
    const bom = v.bom == null ? null : inverter ? !v.bom : v.bom;
    const corpo = v.texto.replace(/^[+-]/, "").replace(" vs. anterior", "");
    const setaTexto = !v.texto ? "" : v.bom == null ? `= ${corpo}` : `${v.texto.startsWith("+") ? "▲" : "▼"} ${corpo}`;
    return (
      <div className="bloco" key={chave}>
        <div className="bloco-k">{rotulo}</div>
        <div className="bloco-v"><NumeroAnimado chave={chave} valor={inteiro ? valor : emMoeda(valor)} texto={inteiro ? String(valor) : money(valor)} casas={inteiro ? 0 : 2} prefixo={inteiro ? "" : prefixo} /></div>
        <div className={`bloco-s num ${bom == null ? "" : bom ? "pos" : "neg"}`} title={v.texto}>{setaTexto}</div>
      </div>
    );
  };

  return (
    <div className="inicial">
      <Suspense fallback={<div className="chips-linha"><div className="skeleton" style={{ width: 240, height: 36, borderRadius: 999 }} /></div>}>
        <SeletorCompacto atalho={estado.atalho} deLocal={ctx.propsSeletor.deLocal} ateLocal={ctx.propsSeletor.ateLocal} tz={estado.tz} moeda={estado.moeda} incluirHistorico={estado.incluirHistorico} incluirManuais={estado.incluirManuais} />
      </Suspense>
      {ctx.problemas.length > 0 && <div className="text-xs text-warn">{ctx.problemas.map((p, i) => <div key={i}>⚠ {p}</div>)}</div>}
      {periodoTocaHoje && <FaixaAtraso atrasos={atrasos} tz={estado.tz} />}

      <div className="entra" key={query}>
        <section className="hero-ini" aria-label="Lucro líquido do período">
          <Entretem />
          <div className="hero-k">Lucro líquido <span className="text-ink-3">· {ctx.propsSeletor.rotuloPeriodo}</span>{incompleto && <span className="bh-incompleto" title="uma fonte está sem atualizar; o valor vai mudar quando ela voltar">incompleto</span>}</div>
          <div className={`hero-v ${t.lucroLiquido < 0 ? "neg" : t.lucroLiquido > 0 ? "pos" : ""}`}>
            <NumeroAnimado chave="lucro" valor={emMoeda(t.lucroLiquido)} texto={money(t.lucroLiquido)} prefixo={prefixo} />
          </div>
          <div className="hero-sub num">
            <span>metade p/ sócio <b className="text-ink">{money(t.porSocio)}</b></span>
            {varLucro.texto && <span className={varLucro.bom == null ? "" : varLucro.bom ? "pos" : "neg"}>{varLucro.texto}</span>}
          </div>
        </section>

        <StatusLinha ultimaOkIso={ultimaOk ? new Date(ultimaOk).toISOString() : null} agendadorOk={agendadorOk} />

        <section className="blocos" aria-label="Números do período">
          {bloco("receita", "Receita líquida", t.receitaLiquida, a.receitaLiquida)}
          {bloco("meta", "Meta c/ imposto", t.metaComImposto, a.metaComImposto, true)}
          {bloco("ia", "IA", t.ia, a.ia, true)}
          {bloco("vendas", "Nº de vendas", t.numVendas, a.numVendas, false, true)}
        </section>

        <AreaAcumulado pontos={acum.pontos.map((p) => ({ rotulo: p.rotulo, acumulado: emMoeda(p.acumulado), valor: emMoeda(p.valor) }))} rotuloFim={rotuloFim} gran={acum.gran} moeda={estado.moeda} />

        {chipsSaldo.length > 0 && (
          <div className="chips-saldo">
            {chipsSaldo.map((c) => <a key={c.nome} href={`/detalhes?${query}#creditos`} className="chip-saldo" title={c.motivo}>⚠ {c.nome} {c.texto}</a>)}
          </div>
        )}

        <a href={`/detalhes?${query}`} className="ver-detalhes">Ver detalhes <span aria-hidden>→</span></a>
      </div>

      <Vivo inicial={{ vendas: hoje.totais.numVendas, lucro: hoje.totais.lucroLiquido, ultimaMxn: null, dia: diaBrasilia(estado.agora) }} />
    </div>
  );
}
