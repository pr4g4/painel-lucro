/**
 * OpenAI: uso por hora (tokens por modelo/projeto) + custo diário em USD (chave de administrador).
 * Custo por hora = custo do dia rateado pelo peso de tokens de cada hora (marcado `estimado`); o dia fecha em UTC.
 * Chave natural: `openai|instanteUTC|modelo`.
 */
import { executarColeta, upsertLancamentos, taxaDoDia, diaBrasilia, marcoZeroAtual, abrirAviso, type NovoLancamento } from "./base";

export type UsoBucket = { start_time: number; end_time: number; results: { input_tokens: number; input_cached_tokens?: number; output_tokens: number; model?: string | null; project_id?: string | null }[] };

/** Preços por 1M tokens [entrada, entrada em cache, saída], em US$. Pode ser sobrescrito pelo parâmetro `openai_precos_json`. */
export const PRECOS_PADRAO: Record<string, [number, number, number]> = {
  "gpt-4o-mini": [0.15, 0.075, 0.60], "gpt-4o": [2.50, 1.25, 10.00],
  "gpt-4.1": [2.00, 0.50, 8.00], "gpt-4.1-mini": [0.40, 0.10, 1.60], "gpt-4.1-nano": [0.10, 0.025, 0.40],
  "gpt-5": [1.25, 0.125, 10.00], "gpt-5-mini": [0.25, 0.025, 2.00], "gpt-5-nano": [0.05, 0.005, 0.40],
  "o3": [2.00, 0.50, 8.00], "o4-mini": [1.10, 0.275, 4.40], "o3-mini": [1.10, 0.55, 4.40],
};

/** Acha o preço de um modelo (aceita sufixos de data, ex.: gpt-4o-mini-2024-07-18). */
export function precoDoModelo(modelo: string, tabela: Record<string, [number, number, number]>): [number, number, number] | null {
  const m = modelo.toLowerCase();
  if (tabela[m]) return tabela[m];
  const chaves = Object.keys(tabela).sort((a, b) => b.length - a.length);
  const k = chaves.find((c) => m.startsWith(c));
  return k ? tabela[k] : null;
}

export function custoEstimado(r: { input_tokens: number; input_cached_tokens?: number; output_tokens: number }, preco: [number, number, number]): number {
  const cached = r.input_cached_tokens ?? 0;
  const inNaoCache = Math.max(0, (r.input_tokens ?? 0) - cached); // input_tokens inclui os em cache
  return (inNaoCache * preco[0] + cached * preco[1] + (r.output_tokens ?? 0) * preco[2]) / 1_000_000;
}
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
      const r = await fetch(u, { headers: { Authorization: `Bearer ${adminKey}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
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
    // tabela de preços (parâmetro opcional openai_precos_json sobrescreve/complementa a padrão)
    const tabela: Record<string, [number, number, number]> = { ...PRECOS_PADRAO };
    try {
      const { db, schema } = await import("@/db"); const { eq } = await import("drizzle-orm");
      const [pp] = await db.select().from(schema.parametros).where(eq(schema.parametros.chave, "openai_precos_json")).limit(1);
      if (pp) Object.assign(tabela, JSON.parse(pp.valor));
    } catch { /* usa a padrão */ }
    // por hora/modelo: tokens e custo ESTIMADO por tipo de token (entrada, entrada em cache, saída)
    type Chave = { instante: Date; modelo: string; tokens: number; est: number | null; in: number; cached: number; out: number };
    const horas: Chave[] = [];
    const tokensDia = new Map<string, number>(); const estDia = new Map<string, number>();
    for (const b of uso) {
      const instante = new Date(b.start_time * 1000);
      const dia = instante.toISOString().slice(0, 10);
      for (const r of b.results) {
        const tokens = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
        if (!tokens) continue;
        const modelo = r.model ?? "desconhecido";
        const preco = precoDoModelo(modelo, tabela);
        const est = preco ? custoEstimado(r, preco) : null;
        horas.push({ instante, modelo, tokens, est, in: r.input_tokens ?? 0, cached: r.input_cached_tokens ?? 0, out: r.output_tokens ?? 0 });
        tokensDia.set(dia, (tokensDia.get(dia) ?? 0) + tokens);
        if (est != null) estDia.set(dia, (estDia.get(dia) ?? 0) + est);
      }
    }
    // custo médio por token (só para modelo sem preço na tabela)
    let custoRef = 0, tokensRef = 0;
    for (const [dia, custo] of custoDia) { const t = tokensDia.get(dia) ?? 0; if (custo > 0 && t > 0) { custoRef += custo; tokensRef += t; } }
    const custoPorToken = tokensRef > 0 ? custoRef / tokensRef : null;
    const rows: NovoLancamento[] = [];
    let semCambio = false;
    for (const h of horas) {
      const dia = h.instante.toISOString().slice(0, 10);
      const custo = custoDia.get(dia) ?? 0;
      const estimativa = h.est ?? (custoPorToken != null ? h.tokens * custoPorToken : 0);
      const semCustoFechado = custo <= 0;
      // dia fechado pela costs API: rateia o custo real pelo peso do custo estimado de cada hora/modelo (substitui a estimativa, mesma chave → sem dobrar)
      const pesoDia = estDia.get(dia) ?? 0;
      const usd = semCustoFechado ? estimativa : pesoDia > 0 && h.est != null ? custo * (h.est / pesoDia) : custo * (h.tokens / (tokensDia.get(dia) ?? 1));
      const cambio = await taxaDoDia("USDBRL", diaBrasilia(h.instante));
      if (!cambio) { semCambio = true; continue; }
      rows.push({
        fonte: "openai", tipo: "uso_ia", chaveNatural: `openai|${h.instante.toISOString()}|${h.modelo}`, instante: h.instante, granularidade: "hora",
        descricao: `OpenAI ${h.modelo} (${h.in} entrada, ${h.cached} em cache, ${h.out} saída${semCustoFechado ? (h.est != null ? "; estimado pela tabela de preços, dia ainda não fechado" : "; estimado por custo médio, modelo sem preço") : "; rateio do custo fechado do dia"})`, valorOriginal: String(usd), moeda: "USD", valorBrl: String(usd * cambio.taxa), taxaCambio: String(cambio.taxa),
        modelo: h.modelo, historico: h.instante < marco, estimado: semCustoFechado, payload: { tokens: h.tokens, entrada: h.in, cache: h.cached, saida: h.out, custoDiaUsd: custo, estimado: semCustoFechado, estimativaUsd: estimativa },
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
