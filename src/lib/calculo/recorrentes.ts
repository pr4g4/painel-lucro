import { addMonths } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { ManualCalc, Periodo, CambioFn } from "./tipos";
import { dentro } from "./periodo";

const HORA = 3_600_000;

/** Meses por ciclo para cada frequência baseada em mês. */
const MESES: Partial<Record<ManualCalc["frequencia"], number>> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };

/**
 * Valor (em moeda original) de um lançamento manual que cai dentro do período.
 * Único: inteiro no instante. Diária/semanal: valor × horas sobrepostas ÷ 24 (ou 168).
 * Mensal e múltiplos: ciclo começa no dia/hora de `comecaEm` (no fuso) e termina no mesmo dia/hora N meses depois;
 * cada hora do ciclo vale valor ÷ horas do ciclo (outubro: 119 ÷ 31 ÷ 24).
 */
export function valorNoPeriodo(m: ManualCalc, p: Periodo, tz: string): number {
  if (!m.ativo) return 0;
  const ativo: Periodo = { inicio: m.comecaEm, fim: m.terminaEm ?? new Date(8.64e15) };
  const janela = intersecao(p, ativo);
  if (!janela) return 0;

  if (m.frequencia === "unica") return dentro(m.comecaEm, p) ? m.valor : 0;
  if (m.frequencia === "diaria") return m.valor * horas(janela) / 24;
  if (m.frequencia === "semanal") return m.valor * horas(janela) / (7 * 24);

  const n = MESES[m.frequencia]!;
  let total = 0;
  // Acha o ciclo que contém o início da janela e caminha até passar do fim.
  const inicioLocal = toZonedTime(m.comecaEm, tz);
  let k = Math.max(0, Math.floor(mesesEntre(inicioLocal, toZonedTime(janela.inicio, tz)) / n) - 1);
  let guarda = 0;
  while (guarda++ < 10000) {
    const cIni = fromZonedTime(addMonths(inicioLocal, k * n), tz);
    const cFim = fromZonedTime(addMonths(inicioLocal, (k + 1) * n), tz);
    if (cIni >= janela.fim) break;
    const sobre = intersecao(janela, { inicio: cIni, fim: cFim });
    if (sobre) total += m.valor * horas(sobre) / horas({ inicio: cIni, fim: cFim });
    k++;
  }
  return total;
}

/** Converte para BRL usando a taxa do dia de início do período (recorrentes) ou do próprio lançamento (único). */
export function valorBrlNoPeriodo(m: ManualCalc, p: Periodo, tz: string, cambio: CambioFn): { brl: number; taxa: number | null; indisponivel?: string } {
  const orig = valorNoPeriodo(m, p, tz);
  if (orig === 0) return { brl: 0, taxa: 1 };
  if (m.moeda === "BRL") return { brl: orig, taxa: 1 };
  const dia = m.frequencia === "unica" ? m.comecaEm : p.inicio;
  const par = m.moeda === "USD" ? "USDBRL" : m.moeda === "MXN" ? "MXNBRL" : null;
  if (!par) return { brl: 0, taxa: null, indisponivel: `moeda ${m.moeda} desconhecida` };
  const taxa = cambio(par, dia);
  if (taxa == null) return { brl: 0, taxa: null, indisponivel: `sem câmbio ${par} para ${dia.toISOString().slice(0, 10)}` };
  return { brl: orig * taxa, taxa };
}

function intersecao(a: Periodo, b: Periodo): Periodo | null {
  const ini = Math.max(a.inicio.getTime(), b.inicio.getTime());
  const fim = Math.min(a.fim.getTime(), b.fim.getTime());
  return fim > ini ? { inicio: new Date(ini), fim: new Date(fim) } : null;
}

function horas(p: Periodo): number {
  return (p.fim.getTime() - p.inicio.getTime()) / HORA;
}

function mesesEntre(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}
