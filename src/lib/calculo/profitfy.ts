/**
 * Cálculos de exibição no estilo Profitfy (não alteram a DRE):
 * - cinco cards (Lucro Líquido, Receita Líquida, Custo dos Produtos = IA, Marketing = anúncios c/ imposto, Taxas e Impostos)
 * - blocos por forma de pagamento (OXXO, SPEI, outros) com conversão
 * - metas do mês (receita líquida e lucro líquido) com progresso
 * - aportes dos sócios (fora do lucro)
 */
import type { Entrada, ManualCalc, Periodo, ResultadoDRE, VendaCalc } from "./tipos";
import { rotuloMetodo } from "./hora";

export type Card = { chave: "lucro" | "receita" | "produtos" | "marketing" | "taxas"; rotulo: string; valor: number; anterior: number | null; inverter: boolean; nota: string };

export function cardsProfitfy(atual: ResultadoDRE, anterior: ResultadoDRE | null): Card[] {
  const t = atual.totais, i = atual.indicadores, a = anterior?.totais ?? null, ai = anterior?.indicadores ?? null;
  return [
    { chave: "lucro", rotulo: "Lucro Líquido", valor: t.lucroLiquido, anterior: a?.lucroLiquido ?? null, inverter: false, nota: "depois de taxas, anúncios, IA, operação e imposto" },
    { chave: "receita", rotulo: "Receita Líquida", valor: t.receitaLiquida, anterior: a?.receitaLiquida ?? null, inverter: false, nota: "aprovadas − taxas da Zenith − reembolsos" },
    { chave: "produtos", rotulo: "Custo dos Produtos", valor: t.ia, anterior: a?.ia ?? null, inverter: true, nota: "créditos de IA (kie.ai + OpenAI)" },
    { chave: "marketing", rotulo: "Marketing", valor: t.anunciosComImposto, anterior: a?.anunciosComImposto ?? null, inverter: true, nota: t.tiktokComImposto > 0 ? "Meta + TikTok, com imposto" : "Meta Ads com imposto" },
    { chave: "taxas", rotulo: "Taxas e Impostos", valor: i.taxasEImpostos, anterior: ai?.taxasEImpostos ?? null, inverter: true, nota: "taxas da Zenith + imposto sobre o lucro" },
  ];
}

export type FormaPagamento = { forma: string; aprovadasQtd: number; aprovadasValor: number; pendentesQtd: number; pendentesValor: number; outrasQtd: number; conversao: number | null };

/** Por forma de pagamento (pela data de criação do pedido, para medir conversão): aprovadas, pendentes, outras (reembolso/chargeback/cancelada). */
export function porFormaPagamento(vendas: VendaCalc[], periodo: Periodo, incluirHistorico = false): FormaPagamento[] {
  const g = new Map<string, FormaPagamento>();
  for (const v of vendas) {
    if (!incluirHistorico && v.historico) continue;
    const quando = v.criadaEm ?? v.aprovadaEm; if (!quando || quando < periodo.inicio || quando >= periodo.fim) continue;
    const forma = rotuloMetodo(v.metodo) === "—" ? "outros" : rotuloMetodo(v.metodo);
    const f = g.get(forma) ?? { forma, aprovadasQtd: 0, aprovadasValor: 0, pendentesQtd: 0, pendentesValor: 0, outrasQtd: 0, conversao: null };
    if (v.status === "aprovada") { f.aprovadasQtd++; f.aprovadasValor += v.liquidoBrl; }
    else if (v.status === "pendente") { f.pendentesQtd++; f.pendentesValor += v.liquidoBrl; }
    else f.outrasQtd++;
    g.set(forma, f);
  }
  for (const f of g.values()) { const total = f.aprovadasQtd + f.pendentesQtd + f.outrasQtd; f.conversao = total ? f.aprovadasQtd / total : null; }
  return [...g.values()].sort((x, y) => y.aprovadasValor - x.aprovadasValor);
}

export type Meta = { chave: "receita" | "lucro"; rotulo: string; meta: number; realizado: number; progresso: number; faltam: number; ritmoNecessarioPorDia: number | null };

/** Metas do mês (parâmetros meta_receita_mes / meta_lucro_mes, 0 = sem meta). `diasRestantes` em dias (fração permitida). */
export function metasDoMes(mes: ResultadoDRE, metaReceita: number, metaLucro: number, diasRestantes: number): Meta[] {
  const uma = (chave: Meta["chave"], rotulo: string, meta: number, realizado: number): Meta | null => {
    if (!(meta > 0)) return null;
    const faltam = Math.max(0, meta - realizado);
    return { chave, rotulo, meta, realizado, progresso: Math.max(0, Math.min(1, realizado / meta)), faltam, ritmoNecessarioPorDia: diasRestantes > 0 ? faltam / diasRestantes : null };
  };
  return [uma("receita", "Receita Líquida", metaReceita, mes.totais.receitaLiquida), uma("lucro", "Lucro Líquido", metaLucro, mes.totais.lucroLiquido)].filter((m): m is Meta => !!m);
}

/** Aportes dos sócios lançados no período (tipo "aporte"): fora de todas as fórmulas, só informativo. */
export function aportesNoPeriodo(manuais: ManualCalc[], periodo: Periodo, cambio: Entrada["opcoes"]["cambio"]): { total: number; itens: { descricao: string; quando: Date; brl: number }[] } {
  const itens = manuais.filter((m) => m.tipo === "aporte" && m.ativo && m.comecaEm >= periodo.inicio && m.comecaEm < periodo.fim)
    .map((m) => ({ descricao: m.descricao, quando: m.comecaEm, brl: m.moeda === "BRL" ? m.valor : m.valor * (cambio(m.moeda === "USD" ? "USDBRL" : "MXNBRL", m.comecaEm) ?? 0) }));
  return { total: itens.reduce((s, x) => s + x.brl, 0), itens };
}
