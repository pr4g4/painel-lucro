/**
 * Meta Ads: gasto por campanha por hora (quando a conta permite) ou por dia.
 * Estratégia por conta: síncrono com breakdown horário → se vazio, relatório assíncrono → se vazio, diário (selo "diário").
 * Guarda em `lancamentos` com chave `meta|conta|campanha|instante`.
 * Chamadas por ciclo de 10 min (por conta): 1 insights de HOJE (dia inteiro, por hora). Fuso da conta fica em memória por 24 h;
 * lista de campanhas só 1× por hora; ONTEM é refeito 1× às 06h e 1× às 12h (Brasília) e logo após uma falha (a Meta ajusta gasto retroativamente).
 */
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { executarColeta, upsertLancamentos, marcoZeroAtual, abrirAviso, resolverAvisos, type NovoLancamento } from "./base";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { lembrar } from "@/lib/memoria";

export type MetaLinha = {
  campaign_id: string; campaign_name: string; spend: string; date_start: string; // AAAA-MM-DD no fuso da conta
  hourly_stats_aggregated_by_advertiser_time_zone?: string; // "HH:00:00 - HH:59:59"
  effective_status?: string;
};
export interface MetaCliente {
  /** Tenta hora; devolve { granularidade } informando o que a conta conseguiu entregar. */
  insights(contaId: string, deDia: string, ateDia: string): Promise<{ linhas: MetaLinha[]; granularidade: "hora" | "dia"; fusoConta: string }>;
  campanhas(contaId: string): Promise<{ id: string; name: string; effective_status: string }[]>;
  /** Fuso da conta (1 chamada; o coletor guarda em memória por 24 h). Opcional: sem ele, insights() informa. */
  fuso?(contaId: string): Promise<string>;
}

/** Mensagem em português para os erros comuns da Meta, com o que fazer. */
export function explicarErroMeta(e: { code?: number | string; message?: string; type?: string }): string | null {
  const code = Number(e.code); const msg = e.message ?? "";
  if (code === 200 || /access blocked/i.test(msg)) return "Meta: acesso à API bloqueado (API access blocked). Entre em developers.facebook.com e confirme a conta de desenvolvedor; depois a coleta volta sozinha e refaz hoje e ontem";
  if (code === 190) return "Meta: o token expirou ou foi invalidado. Gere um token novo no Graph API Explorer e troque META_TOKEN na Vercel";
  if (code === 4 || code === 17 || code === 32 || code === 613 || /rate limit|too many calls/i.test(msg)) return "Meta: limite de chamadas atingido; a coleta espera o próximo ciclo";
  if (code === 2637 || /not completed yet/i.test(msg)) return "Meta: relatório ainda em preparo (2637); tentando de novo";
  return null;
}

const GRAPH = "https://graph.facebook.com/v21.0";
const gm = globalThis as unknown as { __metaEntregaHora?: Map<string, number> };
const entregaHora = (gm.__metaEntregaHora ??= new Map<string, number>()); // conta → última vez que o síncrono por hora trouxe linhas

export function metaClienteReal(token: string): MetaCliente {
  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const u = new URL(`${GRAPH}/${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("access_token", token);
    for (let tentativa = 1; ; tentativa++) {
      const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const j = await r.json();
      if (!r.ok || j.error) {
        const e = j.error ?? {};
        // 2637 "adreport job is not completed yet": o relatório ainda está sendo preparado; esperar e tentar de novo não é falha
        if ((Number(e.code) === 2637 || /not completed yet/i.test(e.message ?? "")) && tentativa < 6) { await new Promise((ok) => setTimeout(ok, 2000 * tentativa)); continue; }
        const humano = explicarErroMeta(e);
        throw new Error(`${humano ? `${humano}. ` : ""}Meta ${path}: ${e.message ?? r.status} [code ${e.code ?? "?"}${e.error_subcode ? `, subcode ${e.error_subcode}` : ""}${e.type ? `, ${e.type}` : ""}${e.error_user_title ? `; ${e.error_user_title}: ${e.error_user_msg ?? ""}` : ""}${e.fbtrace_id ? `; fbtrace ${e.fbtrace_id}` : ""}]`);
      }
      return j as T;
    }
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
  const fuso = (contaId: string) => lembrar(`meta:fuso:${contaId}`, async () => (await get<{ timezone_name: string }>(contaId, { fields: "timezone_name" })).timezone_name, { ttlMs: 24 * 3_600_000, rotulo: "fuso da conta Meta" });
  return {
    fuso,
    async insights(contaId, deDia, ateDia) {
      const conta = { timezone_name: await fuso(contaId) };
      const base = { level: "campaign", fields: "campaign_id,campaign_name,spend", time_range: JSON.stringify({ since: deDia, until: ateDia }), time_increment: "1", limit: "500" };
      // 1) síncrono por hora
      const sinc = await get<{ data: MetaLinha[]; paging?: { next?: string } }>(`${contaId}/insights`, { ...base, breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone" });
      let linhas = await paginar(sinc);
      if (linhas.length) { entregaHora.set(contaId, Date.now()); return { linhas, granularidade: "hora", fusoConta: conta.timezone_name }; }
      // conta que já entregou por hora nas últimas 24 h: vazio = sem gasto no período (ex.: madrugada); não gasta chamadas com assíncrono/diário
      if (Date.now() - (entregaHora.get(contaId) ?? 0) < 24 * 3_600_000) return { linhas: [], granularidade: "hora", fusoConta: conta.timezone_name };
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

const TZ_APP = process.env.APP_TZ ?? "America/Sao_Paulo";

/** Decide o que este ciclo refaz: só hoje, ou hoje + ontem (06h e 12h de Brasília, ou logo depois de uma falha). */
export function planoDoCiclo(agora: Date, ultimaFalhou: boolean, tz = TZ_APP): { refazOntem: boolean; buscaCampanhas: boolean; motivo: string } {
  const local = toZonedTime(agora, tz);
  const h = local.getHours(), m = local.getMinutes();
  const janelaOntem = (h === 6 || h === 12) && m < 10;
  return { refazOntem: janelaOntem || ultimaFalhou, buscaCampanhas: m < 10 || ultimaFalhou, motivo: ultimaFalhou ? "recuperação após falha" : janelaOntem ? `janela das ${h}h` : "só hoje" };
}

export async function coletarMeta(cliente: MetaCliente, contas: string[], agora = new Date(), horasRetro?: number) {
  return executarColeta("meta", async () => {
    const marco = await marcoZeroAtual();
    const frentes = await db.select({ id: schema.frentes.id, regraCampanha: schema.frentes.regraCampanha }).from(schema.frentes).orderBy(schema.frentes.ordem);
    const detalhe: Record<string, unknown> = {};
    let total = 0;
    const errosPorConta: string[] = [];
    // ciclo anterior falhou? (esta coleta já inseriu a própria linha, por isso offset 1)
    const [anterior] = await db.select({ ok: schema.coletas.ok }).from(schema.coletas).where(eq(schema.coletas.fonte, "meta")).orderBy(desc(schema.coletas.iniciadaEm)).limit(1).offset(1);
    const plano = horasRetro != null ? { refazOntem: true, buscaCampanhas: true, motivo: `janela manual de ${horasRetro} h` } : planoDoCiclo(agora, anterior ? anterior.ok === false : false);
    const inicioHoje = fromZonedTime(`${diaNoFuso(agora, TZ_APP)}T00:00:00`, TZ_APP);
    const de = horasRetro != null ? new Date(agora.getTime() - horasRetro * 3_600_000) : plano.refazOntem ? new Date(inicioHoje.getTime() - 86_400_000) : inicioHoje;
    detalhe.plano = { ...plano, desde: de.toISOString() };
    let chamadas = 0;
    for (const contaId of contas) {
      try {
      // período em dias no fuso da conta: desde o dia (no fuso da conta) que contém `de` até o dia de agora
      const fusoConta = cliente.fuso ? await cliente.fuso(contaId) : null;
      const diaDe = diaNoFuso(fusoConta ? de : new Date(de.getTime() - 86_400_000), fusoConta ?? TZ_APP);
      const ins = await cliente.insights(contaId, diaDe, diaNoFuso(agora, fusoConta ?? TZ_APP)); chamadas++;
      const { linhas, granularidade } = ins; const fuso = ins.fusoConta;
      detalhe[contaId] = { granularidade, linhas: linhas.length, fusoConta: fuso, desde: diaDe };

      // campanhas (nome, status, número, frente): 1× por hora
      const camps = plano.buscaCampanhas ? await cliente.campanhas(contaId) : [];
      if (plano.buscaCampanhas) chamadas++;
      for (const c of camps) {
        await db.insert(schema.campanhas).values({ contaId, campanhaId: c.id, nome: c.name, status: c.effective_status, numeroWhatsapp: extrairNumeroWhatsapp(c.name), frenteId: await resolverFrente(c.name, frentes), atualizadoEm: new Date() })
          .onConflictDoUpdate({ target: [schema.campanhas.contaId, schema.campanhas.campanhaId], set: { nome: c.name, status: c.effective_status, numeroWhatsapp: extrairNumeroWhatsapp(c.name), frenteId: await resolverFrente(c.name, frentes), atualizadoEm: new Date() } });
      }

      const rows: NovoLancamento[] = [];
      for (const l of linhas) {
        const hora = l.hourly_stats_aggregated_by_advertiser_time_zone ? Number(l.hourly_stats_aggregated_by_advertiser_time_zone.slice(0, 2)) : 0;
        const instante = fromZonedTime(`${l.date_start}T${String(hora).padStart(2, "0")}:00:00`, fuso);
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
    detalhe.chamadasMeta = chamadas;
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
