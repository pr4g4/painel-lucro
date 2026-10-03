import type { Parametro, VendaCalc, LancamentoCalc, ManualCalc, OpcoesCalculo } from "../src/lib/calculo";
import { PARAMETROS_PADRAO } from "../src/lib/calculo";

export const TZ = "America/Sao_Paulo";
export const MARCO_ZERO = new Date("2026-10-03T03:00:00.000Z"); // 03/10/2026 00:00 BRT
export const brt = (s: string) => new Date(`${s}-03:00`); // "2026-10-02T14:30" → instante

export function parametrosPadrao(): Parametro[] {
  return Object.entries(PARAMETROS_PADRAO).map(([chave, { valor }]) => ({
    chave, valor, vigenciaInicio: new Date("2026-09-01T03:00:00Z"), vigenciaFim: null,
  }));
}

export const TAXA_MXN = 0.30; // MXN→BRL de exemplo
export const TAXA_USD = 5.40; // USD→BRL de exemplo

let seq = 0;
/** Venda estilo Zenith: bruto MXN → deduções 7,99% + MX$5 + 2% → líquido; reserva 10% do líquido (retida). */
export function vendaZenith(o: { brutoMxn: number; aprovadaEm: Date; status?: VendaCalc["status"]; reembolsadaEm?: Date | null; produto?: string | null; historico?: boolean; taxa?: number }): VendaCalc {
  const taxa = o.taxa ?? TAXA_MXN;
  const brutoBrl = o.brutoMxn * taxa;
  const taxaPctBrl = brutoBrl * 0.0799;
  const taxaFixaBrl = 5 * taxa;
  const cambioPctBrl = brutoBrl * 0.02;
  const liquidoBrl = brutoBrl - taxaPctBrl - taxaFixaBrl - cambioPctBrl;
  return {
    id: ++seq, fonte: "zenith", idOrigem: `Z${seq}`, status: o.status ?? "aprovada",
    criadaEm: o.aprovadaEm, aprovadaEm: o.status === "pendente" ? null : o.aprovadaEm, reembolsadaEm: o.reembolsadaEm ?? null,
    produto: o.produto ?? null, moeda: "MXN", brutoOriginal: o.brutoMxn, taxaCambio: taxa, brutoBrl,
    taxaPctBrl, taxaFixaBrl, cambioPctBrl, liquidoBrl, reservaBrl: liquidoBrl * 0.10, reservaLiberadaEm: null,
    historico: o.historico ?? false,
  };
}

/** Venda construída a partir do líquido desejado (para bater totais do teste de sanidade). */
export function vendaZenithPorLiquido(liquido: number, aprovadaEm: Date, historico = false): VendaCalc {
  const taxa = TAXA_MXN;
  const brutoBrl = (liquido + 5 * taxa) / (1 - 0.0799 - 0.02);
  return vendaZenith({ brutoMxn: brutoBrl / taxa, aprovadaEm, historico });
}

export function metaLanc(o: { instante: Date; valor: number; conta?: string; campanha?: string; frente?: string | null; historico?: boolean }): LancamentoCalc {
  return {
    id: ++seq, fonte: "meta", tipo: "gasto_anuncio", instante: o.instante, granularidade: "hora",
    descricao: o.campanha ?? "(9302) - 01 - REST. FOTO", valorBrl: o.valor, valorOriginal: o.valor, moeda: "BRL",
    contaId: o.conta ?? "act_240727500555671", campanhaId: o.campanha ?? "c1", modelo: null,
    frente: o.frente === undefined ? "Fotos IA MX" : o.frente, historico: o.historico ?? false, estimado: false,
  };
}

export function iaLanc(fonte: "kie" | "openai", instante: Date, usd: number, historico = false): LancamentoCalc {
  return {
    id: ++seq, fonte, tipo: "uso_ia", instante, granularidade: fonte === "kie" ? "intervalo" : "hora", descricao: `${fonte} uso`,
    valorOriginal: usd, moeda: "USD", valorBrl: usd * TAXA_USD, contaId: null, campanhaId: null, modelo: null, frente: null, historico, estimado: fonte === "openai",
  };
}

export function zapdataManual(comecaEm = brt("2026-10-02T00:00"), terminaEm: Date | null = null): ManualCalc {
  return {
    id: ++seq, tipo: "saida", moeda: "BRL", valor: 119, categoria: "softwares e aplicativos", linhaDre: "zapdata",
    descricao: "ZapData mensalidade", frequencia: "mensal", comecaEm, terminaEm, ativo: true,
  };
}

export function manual(o: Partial<ManualCalc> & { valor: number; comecaEm: Date }): ManualCalc {
  return {
    id: ++seq, tipo: "saida", moeda: "BRL", categoria: "operação", linhaDre: "operacao", descricao: "custo avulso",
    frequencia: "unica", terminaEm: null, ativo: true, ...o,
  };
}

export function opcoes(o: Partial<OpcoesCalculo> = {}): OpcoesCalculo {
  return {
    tz: TZ, marcoZero: MARCO_ZERO, incluirHistorico: false, incluirManuais: true,
    cambio: (par) => (par === "USDBRL" ? TAXA_USD : TAXA_MXN), ...o,
  };
}
