/**
 * OpenAI: uso por hora (tokens por modelo/projeto) + custo diário em USD (chave de administrador).
 * Custo por hora = custo do dia rateado pelo peso de tokens de cada hora (marcado `estimado`); o dia fecha em UTC.
 * Chave natural: `openai|instanteUTC|modelo`.
 */
import { executarColeta, upsertLancamentos, taxaDoDia, diaBrasilia, marcoZeroAtual, abrirAviso, type NovoLancamento } from "./base";

export type UsoBucket = { start_time: number; end_time: number; results: { input_tokens: number; output_tokens: number; model?: string | null; project_id?: string | null }[] };
export type CustoBucket = { start_time: number; end_time: number; results: { amount: { value: number; currency: string }; line_item?: string | null; project_id?: string | null }[] };
export interface OpenAICliente {
  usoPorHora(desdeUnix: number, ateUnix: number, projectId?: string): Promise<UsoBucket[]>;
  custoPorDia(desdeUnix: number, ateUnix: number, projectId?: string): Promise<CustoBucket[]>;
}

export function openaiClienteReal(adminKey: string): OpenAICliente {
  async function get<T>(path: string, params: Record<string, string | string[]>): Promise<T[]> {
    const out: T[] = [];
    let page: string | undefined;
    do {
      const u = new URL(`https://api.openai.com/v1/organization/${path}`);
      for (const [k, v] of Object.entries(params)) Array.isArray(v) ? v.forEach((x) => u.searchParams.append(k, x)) : u.searchParams.set(k, v);
      if (page) u.searchParams.set("page", page);
      const r = await fetch(u, { headers: { Authorization: `Bearer ${adminKey}` }, cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(`OpenAI ${path}: ${j.error?.message ?? r.status}`);
      out.push(...j.data); page = j.has_more ? j.next_page : undefined;
    } while (page);
    return out;
  }
  return {
    usoPorHora: (d, a, p) => get("usage/completions", { start_time: String(d), end_time: String(a), bucket_width: "1h", group_by: ["model", "project_id"], limit: "168", ...(p ? { project_ids: [p] } : {}) }),
    custoPorDia: (d, a, p) => get("costs", { start_time: String(d), end_time: String(a), bucket_width: "1d", group_by: ["project_id"], limit: "30", ...(p ? { project_ids: [p] } : {}) }),
  };
}

export async function coletarOpenAI(cliente: OpenAICliente, projectId: string | undefined, agora = new Date(), dias = 3) {
  return executarColeta("openai", async () => {
    const marco = await marcoZeroAtual();
    const ate = Math.floor(agora.getTime() / 1000);
    const desde = ate - dias * 86_400;
    const [uso, custos] = await Promise.all([cliente.usoPorHora(desde, ate, projectId), cliente.custoPorDia(desde, ate, projectId)]);

    // custo do dia UTC
    const custoDia = new Map<string, number>();
    for (const b of custos) {
      const dia = new Date(b.start_time * 1000).toISOString().slice(0, 10);
      custoDia.set(dia, (custoDia.get(dia) ?? 0) + b.results.reduce((s, r) => s + (r.amount?.value ?? 0), 0));
    }
    // tokens por hora/modelo e por dia (peso)
    type Chave = { instante: Date; modelo: string; tokens: number };
    const horas: Chave[] = [];
    const tokensDia = new Map<string, number>();
    for (const b of uso) {
      const instante = new Date(b.start_time * 1000);
      const dia = instante.toISOString().slice(0, 10);
      for (const r of b.results) {
        const tokens = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
        if (!tokens) continue;
        horas.push({ instante, modelo: r.model ?? "desconhecido", tokens });
        tokensDia.set(dia, (tokensDia.get(dia) ?? 0) + tokens);
      }
    }
    const rows: NovoLancamento[] = [];
    let semCambio = false;
    for (const h of horas) {
      const dia = h.instante.toISOString().slice(0, 10);
      const custo = custoDia.get(dia) ?? 0;
      const usd = custo * (h.tokens / (tokensDia.get(dia) ?? 1));
      const cambio = await taxaDoDia("USDBRL", diaBrasilia(h.instante));
      if (!cambio) { semCambio = true; continue; }
      rows.push({
        fonte: "openai", tipo: "uso_ia", chaveNatural: `openai|${h.instante.toISOString()}|${h.modelo}`, instante: h.instante, granularidade: "hora",
        descricao: `OpenAI ${h.modelo} (${h.tokens} tokens)`, valorOriginal: String(usd), moeda: "USD", valorBrl: String(usd * cambio.taxa), taxaCambio: String(cambio.taxa),
        modelo: h.modelo, historico: h.instante < marco, estimado: true, payload: { tokens: h.tokens, custoDiaUsd: custo },
      });
    }
    // Dias com custo mas sem uso (ex.: custo de outro tipo): grava um lançamento diário para não perder o valor
    for (const [dia, custo] of custoDia) {
      if (tokensDia.has(dia) || custo === 0) continue;
      const instante = new Date(`${dia}T00:00:00Z`);
      const cambio = await taxaDoDia("USDBRL", diaBrasilia(instante));
      if (!cambio) { semCambio = true; continue; }
      rows.push({ fonte: "openai", tipo: "uso_ia", chaveNatural: `openai|${instante.toISOString()}|custo_dia`, instante, granularidade: "dia", descricao: "OpenAI custo do dia (sem uso por hora)", valorOriginal: String(custo), moeda: "USD", valorBrl: String(custo * cambio.taxa), taxaCambio: String(cambio.taxa), historico: instante < marco, estimado: false });
    }
    if (semCambio) await abrirAviso("sem_cambio", "openai", "Sem taxa USD→BRL para converter uso da OpenAI; rode a coleta de câmbio.");
    const registros = await upsertLancamentos(rows);
    return { registros, detalhe: { custoDiaUsd: Object.fromEntries(custoDia) } };
  });
}
