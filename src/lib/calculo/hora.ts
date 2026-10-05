/**
 * Lucro líquido por hora com as vendas marcadas (exibição). Usa calcularDRE por fatia de hora.
 * O imposto sobre lucro é um % do lucro bruto do PERÍODO (não de cada hora), então cada hora recebe
 * lucro bruto da hora × (lucro líquido ÷ lucro bruto do período): a soma das horas bate com a DRE do período.
 */
import { formatInTimeZone } from "date-fns-tz";
import { calcularDRE } from "./dre";
import { fatiar } from "./periodo";
import type { Entrada, Periodo } from "./tipos";

export const MAX_HORAS_LUCRO_POR_HORA = 7 * 24;

export type PontoLucroHora = { inicio: Date; rotulo: string; lucro: number; acumulado: number; meta: number; ia: number; receita: number; vendas: number };
export type VendaMarcada = { instante: Date; rotulo: string; brutoOriginal: number; moeda: string; liquidoBrl: number; metodo: string; produto: string | null; idOrigem: string };

export function rotuloMetodo(metodo: string | null | undefined): string {
  const m = (metodo ?? "").toLowerCase();
  if (m.includes("oxxo") || m.includes("cash")) return "OXXO";
  if (m.includes("spei") || m.includes("transfer")) return "SPEI";
  return metodo ? metodo : "—";
}

export function lucroPorHora(entrada: Entrada, periodo: Periodo, tz: string): { pontos: PontoLucroHora[]; vendas: VendaMarcada[] } | { indisponivel: string } {
  const horas = (periodo.fim.getTime() - periodo.inicio.getTime()) / 3_600_000;
  if (horas > MAX_HORAS_LUCRO_POR_HORA) return { indisponivel: "escolha um período de até 7 dias para ver por hora" };
  const total = calcularDRE({ ...entrada, periodo });
  const fator = total.totais.lucroBruto > 0 ? total.totais.lucroLiquido / total.totais.lucroBruto : 1; // rateio do imposto do período
  let acumulado = 0;
  const pontos = fatiar(periodo, "hora", tz).map((fatia) => {
    const dre = calcularDRE({ ...entrada, periodo: fatia });
    const lucro = dre.totais.lucroBruto * fator;
    acumulado += lucro;
    return { inicio: fatia.inicio, rotulo: formatInTimeZone(fatia.inicio, tz, horas > 24 ? "dd/MM HH'h'" : "HH'h'"), lucro, acumulado, meta: dre.totais.metaComImposto, ia: dre.totais.ia, receita: dre.totais.receitaLiquida, vendas: dre.totais.numVendas };
  });
  const op = entrada.opcoes;
  const vendas = entrada.vendas
    .filter((v) => v.status === "aprovada" && v.aprovadaEm && v.aprovadaEm >= periodo.inicio && v.aprovadaEm < periodo.fim && (op.incluirHistorico || !v.historico))
    .map((v) => ({ instante: v.aprovadaEm!, rotulo: formatInTimeZone(v.aprovadaEm!, tz, "dd/MM HH:mm"), brutoOriginal: v.brutoOriginal, moeda: v.moeda, liquidoBrl: v.liquidoBrl, metodo: rotuloMetodo(v.metodo), produto: v.produto, idOrigem: v.idOrigem }))
    .sort((a, b) => a.instante.getTime() - b.instante.getTime());
  return { pontos, vendas };
}
