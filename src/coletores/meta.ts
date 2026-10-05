/**
 * Meta Ads: gasto por campanha por hora (quando a conta permite) ou por dia.
 * Estratégia por conta: síncrono com breakdown horário → se vazio, relatório assíncrono → se vazio, diário (selo "diário").
 * Guarda em `lancamentos` com chave `meta|conta|campanha|instante`. Recoleta as últimas 48 h a cada ciclo (a Meta ajusta gasto retroativamente).
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { executarColeta, upsertLancamentos, marcoZeroAtual, abrirAviso, resolverAvisos, type NovoLancamento } from "./base";
import { fromZonedTime } from "date-fns-tz";

export type MetaLinha = {
  campaign_id: string; campaign_name: string; spend: string; date_start: string; // AAAA-MM-DD no fuso da conta
  hourly_stats_aggregated_by_advertiser_time_zone?: string; // "HH:00:00 - HH:59:59"
  effective_status?: string;
};
export interface MetaCliente {
  /** Tenta hora; devolve { granularidade } informando o que a conta conseguiu entregar. */
  insights(contaId: string, deDia: string, ateDia: string): Promise<{ linhas: MetaLinha[]; granularidade: "hora" | "dia"; fusoConta: string }>;
  campanhas(contaId: string): Promise<{ id: string; name: string; effective_status: string }[]>;
}

const GRAPH = "https://graph.facebook.com/v21.0";

export function metaClienteReal(token: string): MetaCliente {
  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const u = new URL(`${GRAPH}/${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("access_token", token);
    const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const j = await r.json();
    if (!r.ok || j.error) {
      const e = j.error ?? {};
      throw new Error(`Meta ${path}: ${e.message ?? r.status} [code ${e.code ?? "?"}${e.error_subcode ? `, subcode ${e.error_subcode}` : ""}${e.type ? `, ${e.type}` : ""}${e.error_user_title ? `; ${e.error_user_title}: ${e.error_user_msg ?? ""}` : ""}${e.fbtrace_id ? `; fbtrace ${e.fbtrace_id}` : ""}]`);
    }
    return j as T;
  }
  async function paginar<T>(primeira: { data: T[]; paging?: { next?: string } }): Promise<T[]> {
    const out = [...primeira.data];
    let next = primeira.paging?.next;
    while (next) {
      const r = await fetch(next, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const j = (await r.json()) as { data: T[]; paging?: { next?: string } };
      out.push(...j.data); next = j.paging?.next;
    }
    return out;
  }
  return {
    async insights(contaId, deDia, ateDia) {
      const conta = await get<{ timezone_name: string }>(contaId, { fields: "timezone_name" });
      const base = { level: "campaign", fields: "campaign_id,campaign_name,spend", time_range: JSON.stringify({ since: deDia, until: ateDia }), time_increment: "1", limit: "500" };
      // 1) síncrono por hora
      const sinc = await get<{ data: MetaLinha[]; paging?: { next?: string } }>(`${contaId}/insights`, { ...base, breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone" });
      let linhas = await paginar(sinc);
      if (linhas.length) return { linhas, granularidade: "hora", fusoConta: conta.timezone_name };
      // 2) assíncrono por hora
      const job = await fetch(`${GRAPH}/${contaId}/insights`, { method: "POST", body: new URLSearchParams({ ...base, breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone", access_token: token }), signal: AbortSignal.timeout(20_000) }).then((r) => r.json());
      if (job.report_run_id) {
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const st = await get<{ async_status: string }>(job.report_run_id, { fields: "async_status" });
          if (st.async_status === "Job Completed") break;
          if (st.async_status === "Job Failed") throw new Error("relatório assíncrono falhou");
        }
        const res = await get<{ data: MetaLinha[]; paging?: { next?: string } }>(`${job.report_run_id}/insights`, { limit: "500" });
        linhas = await paginar(res);
        if (linhas.length) return { linhas, granularidade: "hora", fusoConta: conta.timezone_name };
      }
      // 3) diário
      const dia = await get<{ data: MetaLinha[]; paging?: { next?: string } }>(`${contaId}/insights`, base);
      return { linhas: await paginar(dia), granularidade: "dia", fusoConta: conta.timezone_name };
    },
    async campanhas(contaId) {
      const r = await get<{ data: { id: string; name: string; effective_status: string }[]; paging?: { next?: string } }>(`${contaId}/campaigns`, { fields: "id,name,effective_status", limit: "500" });
      return paginar(r);
    },
  };
}

export function extrairNumeroWhatsapp(nome: string): string | null {
  const m = nome.match(/\((\d{4})\)/) ?? nome.match(/\b(9302|8699|6699)\b/);
  return m ? m[1] : null;
}

export async function resolverFrente(nome: string, frentes: { id: number; regraCampanha: string }[]): Promise<number | null> {
  for (const f of frentes) {
    try { if (new RegExp(f.regraCampanha, "i").test(nome)) return f.id; } catch { /* regra inválida */ }
  }
  return null;
}

export async function coletarMeta(cliente: MetaCliente, contas: string[], agora = new Date(), horasRetro = 48) {
  return executarColeta("meta", async () => {
    const marco = await marcoZeroAtual();
    const frentes = await db.select({ id: schema.frentes.id, regraCampanha: schema.frentes.regraCampanha }).from(schema.frentes).orderBy(schema.frentes.ordem);
    const detalhe: Record<string, unknown> = {};
    let total = 0;
    const errosPorConta: string[] = [];
    for (const contaId of contas) {
      try {
      const de = new Date(agora.getTime() - horasRetro * 3_600_000);
      // período em dias no fuso da conta: pedimos um dia a mais para cobrir a virada
      const { linhas, granularidade, fusoConta } = await cliente.insights(contaId, diaNoFuso(new Date(de.getTime() - 86_400_000), "America/Sao_Paulo"), diaNoFuso(agora, "America/Sao_Paulo"));
      detalhe[contaId] = { granularidade, linhas: linhas.length, fusoConta };

      // campanhas (nome, status, número, frente)
      const camps = await cliente.campanhas(contaId);
      for (const c of camps) {
        await db.insert(schema.campanhas).values({ contaId, campanhaId: c.id, nome: c.name, status: c.effective_status, numeroWhatsapp: extrairNumeroWhatsapp(c.name), frenteId: await resolverFrente(c.name, frentes), atualizadoEm: new Date() })
          .onConflictDoUpdate({ target: [schema.campanhas.contaId, schema.campanhas.campanhaId], set: { nome: c.name, status: c.effective_status, numeroWhatsapp: extrairNumeroWhatsapp(c.name), frenteId: await resolverFrente(c.name, frentes), atualizadoEm: new Date() } });
      }

      const rows: NovoLancamento[] = [];
      for (const l of linhas) {
        const hora = l.hourly_stats_aggregated_by_advertiser_time_zone ? Number(l.hourly_stats_aggregated_by_advertiser_time_zone.slice(0, 2)) : 0;
        const instante = fromZonedTime(`${l.date_start}T${String(hora).padStart(2, "0")}:00:00`, fusoConta);
        if (instante < de && granularidade === "hora") continue;
        const spend = Number(l.spend);
        if (!Number.isFinite(spend)) continue;
        rows.push({
          fonte: "meta", tipo: "gasto_anuncio", chaveNatural: `meta|${contaId}|${l.campaign_id}|${instante.toISOString()}`,
          instante, granularidade, descricao: l.campaign_name, valorOriginal: String(spend), moeda: "BRL", valorBrl: String(spend), taxaCambio: "1",
          contaId, campanhaId: l.campaign_id, historico: instante < marco, payload: l,
        });
      }
      total += await upsertLancamentos(rows);
      } catch (e) {
        // uma conta bloqueada não impede a outra; o erro completo vai para o aviso
        const msg = e instanceof Error ? e.message : String(e);
        errosPorConta.push(`${contaId}: ${msg}`); detalhe[contaId] = { erro: msg };
      }
    }
    if (errosPorConta.length === contas.length) throw new Error(errosPorConta.join(" | "));
    if (errosPorConta.length) await abrirAviso("coleta_parcial", "meta", `Meta: ${errosPorConta.join(" | ")}`);
    else await resolverAvisos("meta", "coleta_parcial");
    return { registros: total, detalhe };
  });
}

function diaNoFuso(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export const _eq = { and, eq };
