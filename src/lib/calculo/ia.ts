/**
 * Cálculos de EXIBIÇÃO sobre a IA (não alteram a DRE):
 * - IA por venda e IA % da receita líquida, com semáforo contra o ticket médio
 * - IA por hora nas últimas N horas (OpenAI e kie.ai separadas)
 * Sem dado suficiente → null (nunca inventar).
 */
import { formatInTimeZone } from "date-fns-tz";
import type { LancamentoCalc, ResultadoDRE } from "./tipos";

export type SemaforoIA = "verde" | "amarelo" | "vermelho" | null;

export type IAPorVenda = {
  porVenda: number | null;        // R$ de IA por venda aprovada
  openaiPorVenda: number | null;
  kiePorVenda: number | null;
  pctReceita: number | null;      // IA ÷ receita líquida (0–1)
  pctTicket: number | null;       // IA por venda ÷ ticket médio líquido (0–1)
  semaforo: SemaforoIA;           // < 25 % verde · 25–40 % amarelo · > 40 % vermelho
  motivo?: string;
};

/** Limites do semáforo (fração do ticket médio líquido). */
export const LIMITES_IA = { verde: 0.25, amarelo: 0.40 };

export function iaPorVenda(dre: ResultadoDRE, limites = LIMITES_IA): IAPorVenda {
  const t = dre.totais;
  const vazio: IAPorVenda = { porVenda: null, openaiPorVenda: null, kiePorVenda: null, pctReceita: t.receitaLiquida > 0 ? t.ia / t.receitaLiquida : null, pctTicket: null, semaforo: null };
  if (t.numVendas <= 0) return { ...vazio, motivo: "sem venda aprovada no período" };
  const porVenda = t.ia / t.numVendas;
  const ticket = dre.indicadores.ticketMedioLiquido;
  const pctTicket = ticket && ticket > 0 ? porVenda / ticket : null;
  const semaforo: SemaforoIA = pctTicket == null ? null : pctTicket < limites.verde ? "verde" : pctTicket <= limites.amarelo ? "amarelo" : "vermelho";
  return { porVenda, openaiPorVenda: t.iaOpenai / t.numVendas, kiePorVenda: t.iaKie / t.numVendas, pctReceita: vazio.pctReceita, pctTicket, semaforo };
}

export type PontoIAHora = { inicio: Date; rotulo: string; openai: number; kie: number };

/** Gasto de IA (R$) por hora cheia nas últimas `horas` horas até `ate`, OpenAI e kie.ai separadas. Horas sem uso ficam em 0. */
export function iaPorHora(lancamentos: LancamentoCalc[], ate: Date, tz: string, horas = 48): PontoIAHora[] {
  const fim = new Date(ate); fim.setUTCMinutes(0, 0, 0); fim.setUTCHours(fim.getUTCHours() + 1); // hora corrente incluída
  const inicio = new Date(fim.getTime() - horas * 3_600_000);
  const pontos: PontoIAHora[] = [];
  for (let i = 0; i < horas; i++) {
    const h = new Date(inicio.getTime() + i * 3_600_000);
    pontos.push({ inicio: h, rotulo: formatInTimeZone(h, tz, "dd/MM HH'h'"), openai: 0, kie: 0 });
  }
  for (const l of lancamentos) {
    if (l.tipo !== "uso_ia" || (l.fonte !== "openai" && l.fonte !== "kie")) continue;
    const t = l.instante.getTime();
    if (t < inicio.getTime() || t >= fim.getTime()) continue;
    const idx = Math.floor((t - inicio.getTime()) / 3_600_000);
    if (l.fonte === "openai") pontos[idx].openai += l.valorBrl; else pontos[idx].kie += l.valorBrl;
  }
  return pontos;
}

/** Soma dos dois lados em duas janelas: antes e depois de uma marcação (para ver se a mudança no robô baixou o gasto). */
export function compararAntesDepois(pontos: PontoIAHora[], marcacao: Date): { antesPorHora: number; depoisPorHora: number; horasDepois: number } | null {
  const antes = pontos.filter((p) => p.inicio < marcacao), depois = pontos.filter((p) => p.inicio >= marcacao);
  if (!antes.length || !depois.length) return null;
  const soma = (a: PontoIAHora[]) => a.reduce((s, p) => s + p.openai + p.kie, 0);
  return { antesPorHora: soma(antes) / antes.length, depoisPorHora: soma(depois) / depois.length, horasDepois: depois.length };
}
