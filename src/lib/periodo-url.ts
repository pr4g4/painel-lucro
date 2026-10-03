/**
 * Período na URL (compartilhável, sem dado sensível):
 *   p = atalho | de, ate = "AAAA-MM-DDTHH:mm" (hora local do fuso) | tz = America/Sao_Paulo|America/Mexico_City
 *   hist = 1 inclui histórico | man = 0 tira lançamentos manuais | moeda = BRL|MXN | gran = hora|dia
 */
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { resolverAtalho, periodoAnterior, granularidadeAutomatica, type Atalho, type Periodo, type Granularidade } from "@/lib/calculo";

export type Params = Record<string, string | string[] | undefined>;
export type EstadoPeriodo = {
  atalho: Atalho; periodo: Periodo; anterior: Periodo; tz: string; incluirHistorico: boolean; incluirManuais: boolean;
  moeda: "BRL" | "MXN"; gran: Granularidade; granManual: boolean; agora: Date; marcoZero: Date;
};

const ATALHOS: Atalho[] = ["marco_zero", "hoje", "ultimas_6h", "ultimas_24h", "ontem", "7_dias", "mes_atual", "tudo", "personalizado"];
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function lerPeriodo(sp: Params, marcoZero: Date, agora = new Date()): EstadoPeriodo {
  const tz = um(sp.tz) === "America/Mexico_City" ? "America/Mexico_City" : "America/Sao_Paulo";
  let atalho = (ATALHOS.includes(um(sp.p) as Atalho) ? um(sp.p) : "marco_zero") as Atalho;
  let personalizado: Periodo | undefined;
  const de = um(sp.de), ate = um(sp.ate);
  if (de && ate) {
    const i = fromZonedTime(de, tz), f = fromZonedTime(ate, tz);
    if (!Number.isNaN(i.getTime()) && !Number.isNaN(f.getTime()) && f > i) { personalizado = { inicio: i, fim: f }; atalho = "personalizado"; }
  }
  if (atalho === "personalizado" && !personalizado) atalho = "marco_zero";
  const r = resolverAtalho(atalho, agora, marcoZero, tz, personalizado);
  const incluirHistorico = um(sp.hist) === "1" || r.incluirHistorico;
  const granParam = um(sp.gran);
  const granManual = granParam === "hora" || granParam === "dia";
  return {
    atalho, periodo: r.periodo, anterior: periodoAnterior(r.periodo, tz), tz, incluirHistorico,
    incluirManuais: um(sp.man) !== "0", moeda: um(sp.moeda) === "MXN" ? "MXN" : "BRL",
    gran: granManual ? (granParam as Granularidade) : granularidadeAutomatica(r.periodo), granManual, agora, marcoZero,
  };
}

export function paraInputLocal(d: Date, tz: string): string { return formatInTimeZone(d, tz, "yyyy-MM-dd'T'HH:mm"); }

export function queryDe(e: Partial<EstadoPeriodo> & { de?: string; ate?: string }, base?: URLSearchParams): string {
  const q = new URLSearchParams(base);
  if (e.atalho && e.atalho !== "personalizado") { q.set("p", e.atalho); q.delete("de"); q.delete("ate"); }
  if (e.de && e.ate) { q.set("de", e.de); q.set("ate", e.ate); q.set("p", "personalizado"); }
  if (e.tz) q.set("tz", e.tz);
  if (e.incluirHistorico !== undefined) e.incluirHistorico ? q.set("hist", "1") : q.delete("hist");
  if (e.incluirManuais !== undefined) e.incluirManuais ? q.delete("man") : q.set("man", "0");
  if (e.moeda) e.moeda === "MXN" ? q.set("moeda", "MXN") : q.delete("moeda");
  return q.toString();
}
