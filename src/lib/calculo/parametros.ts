import type { Parametro } from "./tipos";

/** Devolve o parâmetro vigente em `quando` (vigencia_inicio <= quando < vigencia_fim). */
export function parametroVigente(params: Parametro[], chave: string, quando: Date): Parametro | null {
  const t = quando.getTime();
  let melhor: Parametro | null = null;
  for (const p of params) {
    if (p.chave !== chave) continue;
    if (p.vigenciaInicio.getTime() > t) continue;
    if (p.vigenciaFim && p.vigenciaFim.getTime() <= t) continue;
    if (!melhor || p.vigenciaInicio > melhor.vigenciaInicio) melhor = p;
  }
  return melhor;
}

export function numeroVigente(params: Parametro[], chave: string, quando: Date, padrao?: number): number {
  const p = parametroVigente(params, chave, quando);
  if (!p) {
    if (padrao !== undefined) return padrao;
    throw new Error(`Parâmetro "${chave}" sem vigência em ${quando.toISOString()}`);
  }
  const n = Number(p.valor);
  if (Number.isNaN(n)) throw new Error(`Parâmetro "${chave}" não é numérico: ${p.valor}`);
  return n;
}

export function textoVigente(params: Parametro[], chave: string, quando: Date, padrao?: string): string {
  const p = parametroVigente(params, chave, quando);
  if (!p) {
    if (padrao !== undefined) return padrao;
    throw new Error(`Parâmetro "${chave}" sem vigência em ${quando.toISOString()}`);
  }
  return p.valor;
}

/** Fator que leva o gasto exibido da Meta ao gasto com imposto: 1 / (1 − pct/100). 12,15% → 1,1383. */
export function fatorImpostoMeta(pct: number): number {
  return 1 / (1 - pct / 100);
}

/** Chaves conhecidas e valores iniciais (usados pelo seed). */
export const PARAMETROS_PADRAO: Record<string, { valor: string; observacao: string }> = {
  marco_zero: { valor: "2026-10-03T03:00:00.000Z", observacao: "03/10/2026 00:00 Brasília. Tudo antes é histórico." },
  imposto_meta_pct: { valor: "12.15", observacao: "Imposto sobre anúncios da Meta. Gasto com imposto = exibido ÷ (1 − 12,15%)." },
  taxa_zenith_pct: { valor: "7.99", observacao: "Taxa percentual da Zenith sobre o bruto." },
  taxa_zenith_fixa_mxn: { valor: "5", observacao: "Taxa fixa por venda em MXN (venda em pesos)." },
  taxa_zenith_fixa_brl: { valor: "5", observacao: "Taxa fixa por venda em BRL (venda em reais)." },
  cambio_zenith_pct: { valor: "2", observacao: "Taxa de câmbio da Zenith sobre o bruto." },
  reserva_zenith_pct: { valor: "10", observacao: "Reserva retida pela Zenith, em % do bruto (conferido: 10%). Não é custo; usada quando a fonte não informa o valor." },
  imposto_lucro_pct: { valor: "8", observacao: "Imposto sobre o lucro do período. Se a base for negativa, 0." },
  imposto_lucro_base: { valor: "a", observacao: "a = lucro bruto; b = receita líquida; c = receita líquida − Meta com imposto." },
  alerta_saldo_horas: { valor: "6", observacao: "Aviso quando o saldo de uma IA durar menos que N horas no ritmo das últimas 3 h." },
  alerta_saldo_usd: { valor: "3", observacao: "Aviso quando o saldo de uma IA ficar abaixo de US$ N." },
  kie_pacote_creditos: { valor: "1000", observacao: "Tamanho do pacote de recarga do kie.ai (1.000 créditos = US$ 5). Usado para inferir uso quando há recarga entre duas leituras." },
};
