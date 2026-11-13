import { Suspense } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { contextoPeriodo } from "@/lib/contexto";
import { lucroAcumulado, alertaSaldo, resolverAtalho } from "@/lib/calculo";
import { carregarCreditos } from "@/coletores/creditos";
import { avisosAbertos } from "@/lib/dados";
import { fontesAtrasadas } from "@/lib/hoje";
import { diaBrasilia } from "@/coletores/base";
import { fmtMoeda, fmtUSD, fmtHorasRestantes, fmtPctSimples } from "@/lib/formato";
import { SeletorCompacto } from "@/components/seletor-compacto";
import { NumeroAnimado } from "@/components/numero-animado";
import { StatusLinha } from "@/components/status-linha";
import { AreaAcumulado } from "@/components/area-acumulado";
import { Vivo } from "@/components/vivo";
import { Entretem } from "@/components/entretem";
import { GuardarUltimoBom } from "@/components/ultimo-bom";
import { FaixaAtraso } from "@/components/faixa-atraso";
import { textoVariacao } from "@/components/metrica";
import type { Params } from "@/lib/periodo-url";

export const dynamic = "force-dynamic";

/** Página inicial: a única tela de números do painel (13/11). */
export default async function Inicio({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  // créditos e avisos não dependem do período: começam junto com o contexto (uma ida ao banco a menos quando a memória está fria)
  const tzUrl = (Array.isArray(sp.tz) ? sp.tz[0] : sp.tz) === "America/Mexico_City" ? "America/Mexico_City" : "America/Sao_Paulo";
  const pCreditos = carregarCreditos(new Date(), tzUrl).catch(() => null);
  const pAvisos = avisosAbertos().catch(() => []);
  const ctx = await contextoPeriodo(sp);
  const { estado, atual, anterior, temBaseAnterior, coletas, taxaMxn } = ctx;
  const [creditos, avisosAb] = await Promise.all([pCreditos, pAvisos]);
  const t = atual.totais, a = anterior.totais;
  const fu = ctx.funilAtual, fa = ctx.funilAnterior;
  const money = (v: number | null | undefined) => fmtMoeda(v, estado.moeda, taxaMxn);
  const prefixo = estado.moeda === "MXN" ? "MX$ " : "R$ ";
  const emMoeda = (v: number) => (estado.moeda === "MXN" && taxaMxn ? v / taxaMxn : v);
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();

  const atrasos = fontesAtrasadas(coletas, estado.agora, avisosAb.some((x) => x.tipo === "webhook_rejeitado"));
  const periodoTocaHoje = estado.periodo.fim.getTime() > estado.agora.getTime() - 60 * 60_000;
  const incompleto = periodoTocaHoje && atrasos.some((x) => x.fonte === "meta" || x.fonte === "tiktok" || x.fonte === "zenith");
  const varLucro = textoVariacao(t.lucroLiquido, a.lucroLiquido, temBaseAnterior, "moeda", estado.moeda, taxaMxn);
  const acum = lucroAcumulado(ctx.entrada, estado.periodo, estado.tz);
  // rótulo do fim: "24h" quando o período fecha à meia-noite (Ontem), senão a hora/dia do fim
  const fimH = formatInTimeZone(estado.periodo.fim, estado.tz, "HH:mm");
  const rotuloFim = acum.gran === "hora" ? (fimH === "00:00" ? "24h" : formatInTimeZone(estado.periodo.fim, estado.tz, "HH'h'")) : formatInTimeZone(new Date(estado.periodo.fim.getTime() - 1), estado.tz, "dd/MM");
  const hoje = estado.atalho === "hoje" ? atual : ctx.calc(resolverAtalho("hoje", estado.agora, estado.marcoZero, estado.tz).periodo); // estado de hoje para o "vivo"
  const ultimaOk = ["meta", "cambio", "openai", "kie"].map((f) => coletas.get(f)?.ultimaOk?.getTime() ?? 0).reduce((m, x) => Math.max(m, x), 0);
  const cambio = coletas.get("cambio");
  const agendadorOk = !!cambio && estado.agora.getTime() - cambio.ultima.getTime() <= 15 * 60_000;
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
          {t.tiktokComImposto > 0 || a.tiktokComImposto > 0 ? bloco("anuncios", "Anúncios (Meta + TikTok)", t.anunciosComImposto, a.anunciosComImposto, true) : bloco("meta", "Meta c/ imposto", t.metaComImposto, a.metaComImposto, true)}
          {bloco("ia", "IA", t.ia, a.ia, true)}
          {bloco("vendas", "Nº de vendas", t.numVendas, a.numVendas, false, true)}
        </section>

        {/* funil do período (13/11): geradas, pendentes e conversão, na definição da "Taxa de aprovação" da Zenith */}
        <section className="blocos blocos-3" aria-label="Funil de vendas do período">
          {bloco("geradas", "Geradas", fu.geradas, fa.geradas, false, true)}
          {(() => {
            const v = textoVariacao(fu.pendentesQtd, fa.pendentesQtd, temBaseAnterior, "int", estado.moeda, taxaMxn);
            const corpo = v.texto.replace(/^[+-]/, "").replace(" vs. anterior", "");
            return (
              <div className="bloco" key="pendentes">
                <div className="bloco-k">Pendentes</div>
                <div className="bloco-v"><NumeroAnimado chave="pendentes" valor={fu.pendentesQtd} texto={String(fu.pendentesQtd)} casas={0} prefixo="" /><span className="bloco-v-sub num"> · {money(fu.pendentesValor)}</span></div>
                <div className={`bloco-s num ${v.bom == null ? "" : v.bom ? "neg" : "pos"}`} title={v.texto}>{!v.texto ? "" : v.bom == null ? `= ${corpo}` : `${v.texto.startsWith("+") ? "▲" : "▼"} ${corpo}`}</div>
              </div>
            );
          })()}
          {(() => {
            const atualPct = fu.conversao, antPct = fa.conversao;
            const temBase = temBaseAnterior && antPct != null;
            const v = textoVariacao(atualPct ?? 0, antPct, temBase, "pct", estado.moeda, taxaMxn);
            const corpo = v.texto.replace(/^[+-]/, "").replace(" vs. anterior", "");
            return (
              <div className="bloco" key="conversao">
                <div className="bloco-k" title="aprovadas ÷ geradas (como a Taxa de aprovação da Zenith)">Conversão</div>
                <div className="bloco-v num">{atualPct == null ? "—" : fmtPctSimples(atualPct, 1)}</div>
                <div className={`bloco-s num ${v.bom == null ? "" : v.bom ? "pos" : "neg"}`} title={v.texto}>{!v.texto ? "" : v.bom == null ? `= ${corpo}` : `${v.texto.startsWith("+") ? "▲" : "▼"} ${corpo}`}</div>
              </div>
            );
          })()}
        </section>

        <AreaAcumulado pontos={acum.pontos.map((p) => ({ rotulo: p.rotulo, acumulado: emMoeda(p.acumulado), valor: emMoeda(p.valor) }))} rotuloFim={rotuloFim} gran={acum.gran} moeda={estado.moeda} />

        {creditos && (
          <div className="saldos-linha num">
            {[creditos.kie, creditos.openai].map((s) => {
              const baixo = !!alertaSaldo(s, creditos.limites);
              const nome = s.fonte === "kie" ? "kie.ai" : "OpenAI";
              return <a key={s.fonte} href="/parametros#creditos" className={`saldo-item ${baixo ? "saldo-baixo" : ""}`} title={s.indisponivel ?? (s.estimado ? "estimado" : "")}>{baixo ? "⚠ " : ""}{nome} {s.indisponivel ? "—" : fmtUSD(s.saldoUsd)}{s.horasRestantes != null ? <span className="text-ink-3"> · {fmtHorasRestantes(s.horasRestantes)}</span> : null}</a>;
            })}
          </div>
        )}

      </div>

      <GuardarUltimoBom quando={formatInTimeZone(estado.agora, estado.tz, "dd/MM HH:mm")} periodo={ctx.propsSeletor.rotuloPeriodo} lucro={t.lucroLiquido} lucroTexto={money(t.lucroLiquido)} itens={[{ k: "receita", v: money(t.receitaLiquida) }, { k: "anúncios", v: money(t.anunciosComImposto) }, { k: "IA", v: money(t.ia) }, { k: "vendas", v: String(t.numVendas) }]} />
      <Vivo inicial={{ vendas: hoje.totais.numVendas, lucro: hoje.totais.lucroLiquido, ultimaMxn: null, dia: diaBrasilia(estado.agora) }} />
    </div>
  );
}
