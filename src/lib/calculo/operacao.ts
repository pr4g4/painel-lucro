/**
 * Visões para a operação (fase 1, só com dado que já existe):
 * - quanto falta vender hoje para empatar (e quantas vendas, pelo ticket médio do próprio dia)
 * - projeção do mês no ritmo atual
 * - gasto Meta com imposto por hora do dia
 * - gasto Meta com imposto por número de WhatsApp (9302/8699/6699)
 * Sem dado suficiente → null com motivo (nunca inventar).
 */
import { toZonedTime } from "date-fns-tz";
import { getDaysInMonth } from "date-fns";
import type { LancamentoCalc, Parametro, Periodo, ResultadoDRE } from "./tipos";
import { fatorImpostoMeta, numeroVigente } from "./parametros";
import { dentro, inicioDoMes } from "./periodo";

export type Indisponivel = { indisponivel: string };

export function faltaParaEmpatar(dre: ResultadoDRE): { faltaReceita: number; vendasNecessarias: number | null; motivo?: string } {
  const falta = dre.indicadores.pontoEquilibrio;
  const ticket = dre.indicadores.ticketMedioLiquido;
  if (falta === 0) return { faltaReceita: 0, vendasNecessarias: 0 };
  if (!ticket || ticket <= 0) return { faltaReceita: falta, vendasNecessarias: null, motivo: "sem venda no período para estimar o ticket" };
  return { faltaReceita: falta, vendasNecessarias: Math.ceil(falta / ticket) };
}

/** Projeção linear do mês: valor até agora ÷ dias decorridos × dias do mês. Exige pelo menos 1 dia decorrido. */
export function projecaoMes(dreMes: ResultadoDRE, agora: Date, tz: string, inicioAcompanhamento?: Date):
  { lucroLiquido: number; receitaLiquida: number; diasDecorridos: number; diasNoMes: number; diasConsiderados: number } | Indisponivel {
  const inicioMes = inicioDoMes(agora, tz);
  const inicio = inicioAcompanhamento && inicioAcompanhamento > inicioMes ? inicioAcompanhamento : inicioMes;
  const diasDecorridos = (agora.getTime() - inicio.getTime()) / 86_400_000;
  const local = toZonedTime(agora, tz);
  const diasNoMes = getDaysInMonth(local);
  if (diasDecorridos < 1) return { indisponivel: "menos de 1 dia de dados no mês" };
  const diasRestantes = diasNoMes - (toZonedTime(inicio, tz).getDate() - 1);
  const fator = diasRestantes / diasDecorridos;
  return {
    lucroLiquido: dreMes.totais.lucroLiquido * fator,
    receitaLiquida: dreMes.totais.receitaLiquida * fator,
    diasDecorridos, diasNoMes, diasConsiderados: diasRestantes,
  };
}

function metaComImposto(l: LancamentoCalc, params: Parametro[]): number {
  return l.valorBrl * fatorImpostoMeta(numeroVigente(params, "imposto_meta_pct", l.instante, 12.15));
}

/** 24 posições (hora local 0–23) com o gasto Meta com imposto. Só vale com dado por hora. */
export function gastoMetaPorHoraDoDia(lancamentos: LancamentoCalc[], periodo: Periodo, tz: string, params: Parametro[], incluirHistorico = false): number[] | Indisponivel {
  const meta = lancamentos.filter((l) => l.fonte === "meta" && dentro(l.instante, periodo) && (incluirHistorico || !l.historico));
  if (meta.length === 0) return { indisponivel: "sem gasto Meta no período" };
  const porHora = meta.filter((l) => l.granularidade === "hora");
  if (porHora.length === 0) return { indisponivel: "a Meta só entregou dado diário para estas contas" };
  const horas = new Array(24).fill(0) as number[];
  for (const l of porHora) horas[toZonedTime(l.instante, tz).getHours()] += metaComImposto(l, params);
  return horas;
}

export function extrairNumeroWhatsapp(nome: string): string | null {
  const m = nome.match(/\((\d{4})\)/) ?? nome.match(/\b(9302|8699|6699)\b/);
  return m ? m[1] : null;
}

/** Gasto Meta com imposto por número de WhatsApp do nome da campanha. Campanha sem número vai para "sem número". */
export function gastoPorNumero(lancamentos: LancamentoCalc[], periodo: Periodo, params: Parametro[], incluirHistorico = false): { numero: string; gasto: number; campanhas: number }[] | Indisponivel {
  const meta = lancamentos.filter((l) => l.fonte === "meta" && dentro(l.instante, periodo) && (incluirHistorico || !l.historico));
  if (meta.length === 0) return { indisponivel: "sem gasto Meta no período" };
  const g = new Map<string, { gasto: number; camps: Set<string> }>();
  for (const l of meta) {
    const n = extrairNumeroWhatsapp(l.descricao) ?? "sem número";
    const cur = g.get(n) ?? { gasto: 0, camps: new Set<string>() };
    cur.gasto += metaComImposto(l, params); cur.camps.add(l.campanhaId ?? l.descricao); g.set(n, cur);
  }
  return [...g.entries()].map(([numero, x]) => ({ numero, gasto: x.gasto, campanhas: x.camps.size })).sort((a, b) => b.gasto - a.gasto);
}
