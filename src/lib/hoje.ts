/** Dados da barra "Hoje" (todas as páginas): DRE de hoje + saldos das IAs + estado das coletas. Tudo com cache de 60 s; nunca quebra a página. */
import { calcularDRE, resolverAtalho, type ResultadoDRE, type SaldoIA } from "@/lib/calculo";
import { montarEntradaAmpla, ultimasColetas, type EstadoColeta } from "@/lib/dados";
import { carregarCreditos } from "@/coletores/creditos";

export type Semaforo = "verde" | "amarelo" | "vermelho" | "cinza";

export function semaforoSaldo(s: SaldoIA | null, coletaFalhando: boolean): Semaforo {
  if (!s || s.indisponivel || s.saldoUsd == null) return "cinza";
  if (coletaFalhando) return "vermelho";
  if (s.horasRestantes == null) return s.saldoUsd > 0 ? "verde" : "vermelho";
  if (s.horasRestantes < 6) return "vermelho";
  if (s.horasRestantes < 12) return "amarelo";
  return "verde";
}

export type DadosHoje = {
  hoje: ResultadoDRE | null;
  kie: SaldoIA | null; openai: SaldoIA | null;
  limites: { horas: number; usd: number } | null;
  coletas: Map<string, EstadoColeta>;
  agora: Date; tz: string; problemas: string[];
};

export async function dadosHoje(tz = process.env.APP_TZ ?? "America/Sao_Paulo"): Promise<DadosHoje> {
  const agora = new Date();
  const problemas: string[] = [];
  const marcoPadrao = new Date("2026-10-03T03:00:00Z");
  const hojeP = resolverAtalho("hoje", agora, marcoPadrao, tz).periodo;
  const [entrada, cred, coletas] = await Promise.all([
    montarEntradaAmpla(hojeP, { tz, incluirHistorico: false, incluirManuais: true }, problemas).catch(() => null),
    carregarCreditos(agora, tz).catch(() => null),
    ultimasColetas().catch(() => new Map<string, EstadoColeta>()),
  ]);
  const hoje = entrada ? calcularDRE({ ...entrada, periodo: hojeP }) : null;
  return { hoje, kie: cred?.kie ?? null, openai: cred?.openai ?? null, limites: cred?.limites ?? null, coletas, agora, tz, problemas };
}

/** Limite de atraso por fonte (min): Meta 30, IAs 60. Zenith entra por webhook (sem coleta periódica): conta como atrasada só se o webhook estiver sendo rejeitado. */
export const LIMITE_ATRASO_MIN: Record<string, number> = { meta: 30, tiktok: 30, openai: 60, kie: 60 };
export type FonteAtrasada = { fonte: string; rotulo: string; desde: Date | null; limiteMin: number; motivo: string };

export function fontesAtrasadas(coletas: Map<string, EstadoColeta>, agora: Date, webhookZenithRejeitado = false): FonteAtrasada[] {
  const out: FonteAtrasada[] = [];
  const rotulos: Record<string, string> = { meta: "Meta", tiktok: "TikTok", openai: "OpenAI", kie: "kie.ai", zenith: "Zenith" };
  for (const [fonte, limiteMin] of Object.entries(LIMITE_ATRASO_MIN)) {
    const c = coletas.get(fonte);
    if (!c || c.naoConfigurada) continue;
    const atrasada = !c.ultimaOk || agora.getTime() - c.ultimaOk.getTime() > limiteMin * 60_000;
    if (atrasada) out.push({ fonte, rotulo: rotulos[fonte], desde: c.ultimaOk, limiteMin, motivo: c.erro ?? "sem coleta ok" });
  }
  if (webhookZenithRejeitado) out.push({ fonte: "zenith", rotulo: "Zenith", desde: coletas.get("zenith")?.ultimaOk ?? null, limiteMin: 30, motivo: "webhook rejeitado" });
  return out;
}

export function coletaFalhando(c: EstadoColeta | undefined, agora: Date): boolean {
  if (!c) return false;
  if (c.naoConfigurada) return false;
  return c.falhasSeguidas >= 3 || !c.ultimaOk || agora.getTime() - c.ultimaOk.getTime() > 30 * 60_000;
}

let ultimaAvaliacaoAgendador = 0;
/** Se o agendador estiver parado, só uma página aberta pode perceber: avalia (e alerta) no máximo a cada 10 min por instância. */
export async function avaliarAgendadorSeParado(d: DadosHoje) {
  const c = d.coletas.get("cambio");
  const parado = !c || d.agora.getTime() - c.ultima.getTime() > 30 * 60_000;
  if (!parado || Date.now() - ultimaAvaliacaoAgendador < 10 * 60_000) return;
  ultimaAvaliacaoAgendador = Date.now();
  try {
    const { processarAlertas } = await import("@/alertas/motor");
    await Promise.race([processarAlertas(d.agora), new Promise((_, rej) => setTimeout(() => rej(new Error("alertas: prazo de 20 s")), 20_000))]);
  } catch (e) { console.warn("[alertas] avaliação a partir da página falhou:", e instanceof Error ? e.message : e); }
}
