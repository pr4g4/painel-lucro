/**
 * Clientes simulados das fontes, para desenvolver e testar sem chave.
 * Reproduzem a forma das respostas reais e os números do teste de sanidade (02/10/2026).
 */
import type { MetaCliente, MetaLinha } from "./meta";
import type { OpenAICliente } from "./openai";
import type { KieCliente } from "./kie";
import type { CambioCliente } from "./cambio";
import type { VendaZenithBruta } from "./zenith";

export const CAMPANHAS_EXEMPLO = {
  act_240727500555671: [
    { id: "120210000000001", name: "(9302) - 01 - REST. FOTO - Video A", effective_status: "ACTIVE" },
    { id: "120210000000002", name: "(8699) - 02 - REST. FOTO - Video B", effective_status: "ACTIVE" },
    { id: "120210000000003", name: "(6699) - 03 - CENAS LIGERAS - Antiga", effective_status: "PAUSED" },
  ],
  act_210256430938513: [
    { id: "120210000000011", name: "(6699) - 01 - REST. FOTO - Video C", effective_status: "ACTIVE" },
  ],
};

/** Gasto por hora: conta 00 soma 200,00 e conta 01 soma 115,29 em 02/10 (total 315,29); dias seguintes com valores quaisquer. */
/** Histórico 12/09–01/10: (3.550,55 × 0,8785 − 315,29) ÷ 20 dias, 60% conta 00 e 40% conta 01. */
const HIST_DIA = (3550.55 * (1 - 0.1215) - 315.29) / 20;

export function metaSimulado(opts: { gastoPorDia?: Record<string, Record<string, number>>; agora?: Date } = {}): MetaCliente {
  return {
    async insights(contaId, deDia, ateDia) {
      const linhas: MetaLinha[] = [];
      const camps = CAMPANHAS_EXEMPLO[contaId as keyof typeof CAMPANHAS_EXEMPLO] ?? [];
      const agora = opts.agora ?? new Date();
      const diaAgora = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
      const horaAgora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(agora));
      for (const dia of diasEntre(deDia, ateDia)) {
        if (dia > diaAgora) continue;
        const c00 = contaId === "act_240727500555671";
        const totalDia = opts.gastoPorDia?.[contaId]?.[dia]
          ?? (dia === "2026-10-02" ? (c00 ? 200 : 115.29)
            : dia >= "2026-09-12" && dia <= "2026-10-01" ? HIST_DIA * (c00 ? 0.6 : 0.4)
            : dia >= "2026-10-03" ? (c00 ? 180.5 : 95.25) : 0);
        if (!totalDia) continue;
        const ativas = camps.filter((c) => c.effective_status === "ACTIVE");
        for (let h = 0; h < 24; h++) {
          if (dia === diaAgora && h > horaAgora) break;
          // distribuição por hora: mais gasto à tarde/noite
          const peso = [1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 6, 6, 6, 7, 7, 8, 8, 9, 9, 8, 6, 4, 2][h];
          const somaPesos = 112;
          for (const c of ativas) {
            linhas.push({
              campaign_id: c.id, campaign_name: c.name, date_start: dia, effective_status: c.effective_status,
              spend: (totalDia * peso / somaPesos / ativas.length).toFixed(6),
              hourly_stats_aggregated_by_advertiser_time_zone: `${String(h).padStart(2, "0")}:00:00 - ${String(h).padStart(2, "0")}:59:59`,
            });
          }
        }
      }
      return { linhas, granularidade: "hora", fusoConta: "America/Sao_Paulo" };
    },
    async campanhas(contaId) { return CAMPANHAS_EXEMPLO[contaId as keyof typeof CAMPANHAS_EXEMPLO] ?? []; },
  };
}

/** OpenAI: 02/10 custa US$ 7,30 (UTC), distribuído em 2 horas de uso; 03/10 US$ 2,10. */
export function openaiSimulado(): OpenAICliente {
  const unix = (s: string) => Math.floor(new Date(s).getTime() / 1000);
  return {
    async usoPorHora(desde, ate) {
      const todos = [
        { start_time: unix("2026-10-02T10:00:00Z"), end_time: unix("2026-10-02T11:00:00Z"), results: [{ input_tokens: 300000, output_tokens: 100000, model: "gpt-4.1-mini", project_id: "proj_cenas" }] },
        { start_time: unix("2026-10-02T15:00:00Z"), end_time: unix("2026-10-02T16:00:00Z"), results: [{ input_tokens: 150000, output_tokens: 50000, model: "gpt-4.1-mini", project_id: "proj_cenas" }] },
        { start_time: unix("2026-10-03T12:00:00Z"), end_time: unix("2026-10-03T13:00:00Z"), results: [{ input_tokens: 100000, output_tokens: 20000, model: "gpt-4.1-mini", project_id: "proj_cenas" }] },
      ];
      return todos.filter((b) => b.start_time >= desde && b.start_time < ate);
    },
    async custoPorDia(desde, ate) {
      const todos = [
        { start_time: unix("2026-10-02T00:00:00Z"), end_time: unix("2026-10-03T00:00:00Z"), results: [{ amount: { value: 7.30, currency: "usd" }, project_id: "proj_cenas" }] },
        { start_time: unix("2026-10-03T00:00:00Z"), end_time: unix("2026-10-04T00:00:00Z"), results: [{ amount: { value: 2.10, currency: "usd" }, project_id: "proj_cenas" }] },
      ];
      return todos.filter((b) => b.start_time >= desde && b.start_time < ate);
    },
  };
}

/** kie.ai: saldo cai a cada leitura. Sequência configurável. */
export function kieSimulado(saldos: number[]): KieCliente {
  let i = 0;
  return { async saldoCreditos() { const s = saldos[Math.min(i, saldos.length - 1)]; i++; return s; } };
}

/** PTAX simulada: USD 5,40 e MXN 0,30 todos os dias úteis. */
export function cambioSimulado(usd = 5.40, mxn = 0.30): CambioCliente {
  return {
    async cotacoes(par, de, ate) {
      return diasEntre(de, ate).filter((d) => { const dow = new Date(`${d}T12:00:00Z`).getUTCDay(); return dow !== 0 && dow !== 6; })
        .map((dia) => ({ dia, taxa: par === "USDBRL" ? usd : mxn }));
    },
  };
}

/** Vendas Zenith de exemplo: 45 históricas (12/09–02/10) somando R$ 1.545,30 líquidos + vendas de hoje. */
export function vendasZenithExemplo(agora = new Date()): VendaZenithBruta[] {
  const out: VendaZenithBruta[] = [];
  const taxa = 0.30;
  const liquidoAlvo = 1545.30 / 45;
  const brutoBrl = (liquidoAlvo + 5 * taxa) / (1 - 0.0799 - 0.02);
  const brutoMxn = brutoBrl / taxa;
  const ini = new Date("2026-09-12T15:00:00Z");
  for (let i = 0; i < 45; i++) {
    const quando = new Date(ini.getTime() + i * 11 * 3_600_000);
    out.push({ id: `H${1000 + i}`, status: "aprovada", criadaEm: quando, aprovadaEm: quando, moeda: "MXN", bruto: brutoMxn, brlEstimado: brutoBrl, produto: [99, 149, 199][i % 3] === 99 ? "Fotos IA 99" : [99, 149, 199][i % 3] === 149 ? "Fotos IA 149" : "Fotos IA 199", reserva: (brutoBrl * (1 - 0.0799 - 0.02) - 5 * taxa) * 0.10 });
  }
  // Hoje (depois do marco zero)
  const hoje0 = new Date(agora); hoje0.setUTCHours(3, 0, 0, 0); // 00:00 BRT
  const vendasHoje: [number, number, string, VendaZenithBruta["status"]][] = [[149, 0.5, "Fotos IA 149", "aprovada"], [199, 1.2, "Fotos IA 199", "aprovada"], [99, 2.1, "Fotos IA 99", "aprovada"], [149, 2.8, "Fotos IA 149", "aprovada"], [99, 3.1, "Fotos IA 99", "pendente"], [149, 9.5, "Fotos IA 149", "aprovada"], [199, 12.2, "Fotos IA 199", "aprovada"], [149, 15.4, "Fotos IA 149", "aprovada"]];
  vendasHoje.forEach(([mxn, h, produto, status], i) => {
    const quando = new Date(hoje0.getTime() + h * 3_600_000);
    if (quando > agora) return;
    const bBrl = mxn * taxa;
    const liq = bBrl * (1 - 0.0799 - 0.02) - 5 * taxa;
    out.push({ id: `T${2000 + i}`, status, criadaEm: quando, aprovadaEm: status === "aprovada" ? quando : null, moeda: "MXN", bruto: mxn, brlEstimado: bBrl, produto, reserva: status === "aprovada" ? liq * 0.10 : 0 });
  });
  return out;
}

function diasEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  const d = new Date(`${de}T00:00:00Z`);
  const fim = new Date(`${ate}T00:00:00Z`);
  while (d <= fim) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
