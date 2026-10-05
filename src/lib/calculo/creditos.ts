/**
 * Saldos de crédito das IAs (função pura, alimentada pelos `lancamentos`):
 *  - kie.ai: leituras reais de saldo (tipo saldo_ia, em créditos) + uso (uso_ia) + recargas inferidas (recarga_ia).
 *  - OpenAI: não há endpoint oficial de saldo. Saldo ESTIMADO = última referência conferida (tipo saldo_ref, em US$)
 *            + recargas registradas depois (recarga_ia, em US$) − custo registrado desde a referência (uso_ia).
 * Duração estimada = saldo ÷ ritmo das últimas 3 h. Sem consumo nas 3 h → "—".
 */
import type { LancamentoCalc } from "./tipos";

export type SaldoIA = {
  fonte: "kie" | "openai";
  saldoUsd: number | null;
  saldoCreditos: number | null; // só kie
  lidoEm: Date | null; // hora da leitura real (kie) ou da referência (openai)
  estimado: boolean;
  usoUltimaHoraUsd: number;
  usoHojeUsd: number;
  ritmoUsdPorHora: number; // média das últimas 3 h
  horasRestantes: number | null;
  recargasHojeUsd: number;
  recargasHojeQtd: number;
  referencia?: { valorUsd: number; em: Date; recargasDepoisUsd: number; custoDepoisUsd: number } | null;
  indisponivel?: string;
};

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const H = 3_600_000;

/** Um lançamento de uso cobre [instante, instante + duração): hora (OpenAI), ou o intervalo entre leituras (kie, gravado no payload? não) → tratamos "intervalo" como 10 min. */
function duracaoMs(x: LancamentoCalc): number {
  return x.granularidade === "hora" ? H : x.granularidade === "dia" ? 24 * H : x.granularidade === "intervalo" ? 10 * 60_000 : 0;
}
/** Soma do uso dentro de [de, ate), rateando os lançamentos que atravessam a borda pela fração sobreposta. */
export function usoEntre(uso: LancamentoCalc[], de: Date, ate: Date): number {
  let total = 0;
  for (const x of uso) {
    const ini = x.instante.getTime(), dur = duracaoMs(x), fim = ini + Math.max(dur, 1);
    const sobre = Math.min(fim, ate.getTime()) - Math.max(ini, de.getTime());
    if (sobre <= 0) continue;
    total += dur === 0 ? x.valorOriginal : x.valorOriginal * (sobre / dur);
  }
  return total;
}

function consumo(l: LancamentoCalc[], fonte: string, agora: Date, inicioHoje: Date) {
  const uso = l.filter((x) => x.fonte === fonte && x.tipo === "uso_ia");
  const em = (de: Date, ate: Date) => usoEntre(uso, de, ate);
  const usoUltimaHoraUsd = em(new Date(agora.getTime() - H), agora);
  const uso3h = em(new Date(agora.getTime() - 3 * H), agora);
  const usoHojeUsd = em(inicioHoje, agora);
  const rec = l.filter((x) => x.fonte === fonte && x.tipo === "recarga_ia" && x.instante >= inicioHoje && x.instante < agora);
  return { usoUltimaHoraUsd, usoHojeUsd, ritmoUsdPorHora: uso3h / 3, recargasHoje: rec };
}

export function saldoKie(l: LancamentoCalc[], agora: Date, inicioHoje: Date, usdPorCredito: number | null): SaldoIA {
  const leituras = l.filter((x) => x.fonte === "kie" && x.tipo === "saldo_ia" && x.instante <= agora).sort((a, b) => b.instante.getTime() - a.instante.getTime());
  const c = consumo(l, "kie", agora, inicioHoje);
  const base: SaldoIA = { fonte: "kie", saldoUsd: null, saldoCreditos: null, lidoEm: null, estimado: false, ...c, ritmoUsdPorHora: c.ritmoUsdPorHora, horasRestantes: null, recargasHojeUsd: soma(c.recargasHoje.map((r) => r.valorOriginal * (usdPorCredito ?? 0))), recargasHojeQtd: c.recargasHoje.length };
  if (!leituras.length) return { ...base, indisponivel: "nenhuma leitura de saldo ainda" };
  const ult = leituras[0];
  const saldoUsd = usdPorCredito != null ? ult.valorOriginal * usdPorCredito : null;
  const horas = saldoUsd != null && c.ritmoUsdPorHora > 0 ? saldoUsd / c.ritmoUsdPorHora : null;
  return { ...base, saldoCreditos: ult.valorOriginal, saldoUsd, lidoEm: ult.instante, horasRestantes: horas, indisponivel: usdPorCredito == null ? "parâmetro kie_usd_por_credito ausente" : undefined };
}

export function saldoOpenAI(l: LancamentoCalc[], agora: Date, inicioHoje: Date): SaldoIA {
  const refs = l.filter((x) => x.fonte === "openai" && x.tipo === "saldo_ref" && x.instante <= agora).sort((a, b) => b.instante.getTime() - a.instante.getTime());
  const c = consumo(l, "openai", agora, inicioHoje);
  const base: SaldoIA = { fonte: "openai", saldoUsd: null, saldoCreditos: null, lidoEm: null, estimado: true, ...c, ritmoUsdPorHora: c.ritmoUsdPorHora, horasRestantes: null, recargasHojeUsd: soma(c.recargasHoje.map((r) => r.valorOriginal)), recargasHojeQtd: c.recargasHoje.length, referencia: null };
  if (!refs.length) return { ...base, indisponivel: "sem saldo de referência: registre 'saldo conferido' no cartão" };
  const ref = refs[0];
  const recargasDepois = soma(l.filter((x) => x.fonte === "openai" && x.tipo === "recarga_ia" && x.instante > ref.instante && x.instante <= agora).map((x) => x.valorOriginal));
  const custoDepois = usoEntre(l.filter((x) => x.fonte === "openai" && x.tipo === "uso_ia"), ref.instante, agora);
  const saldo = ref.valorOriginal + recargasDepois - custoDepois;
  const horas = c.ritmoUsdPorHora > 0 ? Math.max(0, saldo) / c.ritmoUsdPorHora : null;
  return { ...base, saldoUsd: saldo, lidoEm: ref.instante, horasRestantes: horas, referencia: { valorUsd: ref.valorOriginal, em: ref.instante, recargasDepoisUsd: recargasDepois, custoDepoisUsd: custoDepois } };
}

export type LimitesSaldo = { horas: number; usd: number };

/** Motivo do alerta ou null. */
export function alertaSaldo(s: SaldoIA, lim: LimitesSaldo): string | null {
  if (s.indisponivel || s.saldoUsd == null) return null;
  if (s.saldoUsd < lim.usd) return `saldo US$ ${s.saldoUsd.toFixed(2).replace(".", ",")} abaixo de US$ ${lim.usd}`;
  if (s.horasRestantes != null && s.horasRestantes < lim.horas) return `acaba em ~${s.horasRestantes.toFixed(1).replace(".", ",")} h no ritmo atual (limite ${lim.horas} h)`;
  return null;
}
