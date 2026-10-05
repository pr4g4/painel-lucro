import { formatInTimeZone } from "date-fns-tz";

export type Moeda = "BRL" | "MXN";

export function fmtMoeda(v: number | null | undefined, moeda: Moeda = "BRL", taxaMxnBrl?: number | null): string {
  if (v == null || Number.isNaN(v)) return "—";
  let val = v;
  let cur = "BRL";
  if (moeda === "MXN") { if (!taxaMxnBrl) return "—"; val = v / taxaMxnBrl; cur = "MXN"; }
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}
export const fmtBRL = (v: number | null | undefined) => fmtMoeda(v, "BRL");
export const fmtMXN = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "MXN" }).format(v));
export function fmtNum(v: number | null | undefined, casas = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);
}
export function fmtPct(v: number | null | undefined, casas = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v * 100)}%`;
}
export function fmtPctSimples(v: number | null | undefined, casas = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v * 100)}%`;
}
export function fmtDataHora(d: Date | string | null | undefined, tz: string, padrao = "dd/MM HH:mm"): string {
  if (!d) return "—";
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, tz, padrao);
}
export function fmtHora(d: Date | null | undefined, tz: string): string { return fmtDataHora(d, tz, "HH:mm"); }
export function fmtRazao(v: number | null | undefined): string { return v == null || !Number.isFinite(v) ? "—" : `${fmtNum(v, 2)}×`; }
export const ROTULO_TZ: Record<string, string> = { "America/Sao_Paulo": "Brasília", "America/Mexico_City": "México" };
