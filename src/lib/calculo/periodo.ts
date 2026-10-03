import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, addHours, startOfDay, startOfMonth, differenceInMinutes } from "date-fns";
import type { Periodo } from "./tipos";

export type Atalho =
  | "marco_zero" | "hoje" | "ultimas_6h" | "ultimas_24h" | "ontem" | "7_dias" | "mes_atual" | "tudo" | "personalizado";

export const ROTULO_ATALHO: Record<Atalho, string> = {
  marco_zero: "Desde o marco zero",
  hoje: "Hoje",
  ultimas_6h: "Últimas 6 h",
  ultimas_24h: "Últimas 24 h",
  ontem: "Ontem",
  "7_dias": "7 dias",
  mes_atual: "Mês atual",
  tudo: "Tudo (com histórico)",
  personalizado: "Personalizado",
};

/** Início do dia local (no fuso) convertido para instante UTC. */
export function inicioDoDia(instante: Date, tz: string): Date {
  return fromZonedTime(startOfDay(toZonedTime(instante, tz)), tz);
}

export function inicioDoMes(instante: Date, tz: string): Date {
  return fromZonedTime(startOfMonth(toZonedTime(instante, tz)), tz);
}

/** Resolve um atalho para um período concreto. `agora` é o instante atual; `marcoZero` vem dos parâmetros. */
export function resolverAtalho(
  atalho: Atalho, agora: Date, marcoZero: Date, tz: string, personalizado?: Periodo,
): { periodo: Periodo; incluirHistorico: boolean } {
  const hoje0 = inicioDoDia(agora, tz);
  switch (atalho) {
    case "marco_zero": return { periodo: { inicio: marcoZero, fim: agora }, incluirHistorico: false };
    case "hoje": return { periodo: { inicio: hoje0, fim: agora }, incluirHistorico: false };
    case "ultimas_6h": return { periodo: { inicio: addHours(agora, -6), fim: agora }, incluirHistorico: false };
    case "ultimas_24h": return { periodo: { inicio: addHours(agora, -24), fim: agora }, incluirHistorico: false };
    case "ontem": return { periodo: { inicio: addDays(hoje0, -1), fim: hoje0 }, incluirHistorico: false };
    case "7_dias": return { periodo: { inicio: addDays(hoje0, -6), fim: agora }, incluirHistorico: false };
    case "mes_atual": return { periodo: { inicio: inicioDoMes(agora, tz), fim: agora }, incluirHistorico: false };
    case "tudo": return { periodo: { inicio: new Date("2000-01-01T00:00:00Z"), fim: agora }, incluirHistorico: true };
    case "personalizado":
      if (!personalizado) throw new Error("Período personalizado sem início/fim");
      return { periodo: personalizado, incluirHistorico: personalizado.inicio < marcoZero };
  }
}

/**
 * Período anterior para comparação.
 * Regra geral: mesma duração, terminando onde o atual começa (últimas 6 h → 6 h anteriores).
 * Exceção "Hoje" (e qualquer recorte que começa à meia-noite local e dura menos de 24 h): desloca 24 h,
 * virando "ontem até a mesma hora" em vez de "fim de anteontem".
 */
export function periodoAnterior(p: Periodo, tz = "America/Sao_Paulo"): Periodo {
  const dur = p.fim.getTime() - p.inicio.getTime();
  const DIA = 86_400_000;
  const comecaMeiaNoite = inicioDoDia(p.inicio, tz).getTime() === p.inicio.getTime();
  if (comecaMeiaNoite && dur < DIA) {
    return { inicio: new Date(p.inicio.getTime() - DIA), fim: new Date(p.fim.getTime() - DIA) };
  }
  return { inicio: new Date(p.inicio.getTime() - dur), fim: new Date(p.inicio.getTime()) };
}

export type Granularidade = "hora" | "dia";

/** Até 48 h por hora; acima disso por dia. */
export function granularidadeAutomatica(p: Periodo): Granularidade {
  const horas = (p.fim.getTime() - p.inicio.getTime()) / 3_600_000;
  return horas <= 48 ? "hora" : "dia";
}

/** Divide o período em intervalos alinhados ao fuso (hora cheia ou dia local). */
export function fatiar(p: Periodo, gran: Granularidade, tz: string): Periodo[] {
  const fatias: Periodo[] = [];
  let ini = gran === "hora" ? alinharHora(p.inicio) : inicioDoDia(p.inicio, tz);
  let guarda = 0;
  while (ini < p.fim && guarda++ < 5000) {
    const prox = gran === "hora" ? addHours(ini, 1) : fromZonedTime(addDays(toZonedTime(ini, tz), 1), tz);
    fatias.push({ inicio: new Date(Math.max(ini.getTime(), p.inicio.getTime())), fim: new Date(Math.min(prox.getTime(), p.fim.getTime())) });
    ini = prox;
  }
  return fatias;
}

function alinharHora(d: Date): Date {
  const c = new Date(d);
  c.setUTCMinutes(0, 0, 0);
  return c;
}

export function minutosDoPeriodo(p: Periodo): number {
  return differenceInMinutes(p.fim, p.inicio);
}

export function dentro(instante: Date | null | undefined, p: Periodo): boolean {
  if (!instante) return false;
  const t = instante.getTime();
  return t >= p.inicio.getTime() && t < p.fim.getTime();
}
