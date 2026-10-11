/**
 * TikTok Ads: gasto por campanha por hora (Marketing API v1.3, relatório integrado, nível campanha, dimensão stat_time_hour).
 * - Moeda da conta (USD/MXN/BRL) vem de /advertiser/info/ e é convertida para BRL pelo câmbio do dia (PTAX USD; MXN cruzado).
 * - Mesmo plano de ciclo da Meta: hoje a cada 10 min; ontem às 06h/12h e após falha; campanhas 1× por hora.
 * - Chave natural `tiktok|advertiser|campanha|instante`. Imposto pelo parâmetro imposto_tiktok_pct (padrão 0).
 * Alternativa sem API: CSV exportado do Ads Manager (lerCsvTikTok + importarCsvTikTok).
 */
import { desc, eq } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { db, schema } from "@/db";
import { executarColeta, upsertLancamentos, marcoZeroAtual, taxaDoDia, diaBrasilia, abrirAviso, resolverAvisos, type NovoLancamento } from "./base";
import { extrairNumeroWhatsapp, resolverFrente, planoDoCiclo } from "./meta";
import { lembrar } from "@/lib/memoria";

export type TikTokLinha = { campaign_id: string; campaign_name: string; spend: number; stat_time: string }; // "AAAA-MM-DD HH:00:00" no fuso da conta (ou "AAAA-MM-DD" se diário)
export type TikTokConta = { id: string; nome: string; moeda: string; fuso: string };
export interface TikTokCliente {
  conta(advertiserId: string): Promise<TikTokConta>;
  relatorio(advertiserId: string, deDia: string, ateDia: string): Promise<{ linhas: TikTokLinha[]; granularidade: "hora" | "dia" }>;
  campanhas(advertiserId: string): Promise<{ id: string; name: string; status: string }[]>;
}

const API = "https://business-api.tiktok.com/open_api/v1.3";

export function explicarErroTikTok(code: number, message: string): string | null {
  if (code === 40105 || code === 40104 || /access token/i.test(message)) return "TikTok: token inválido ou expirado. Gere um novo em TikTok for Business → Marketing API e troque TIKTOK_ACCESS_TOKEN na Vercel";
  if (code === 40100 || /permission/i.test(message)) return "TikTok: o app não tem permissão nessa conta de anúncios; autorize o advertiser no app do Marketing API";
  if (code === 40001 || /rate limit|too many/i.test(message)) return "TikTok: limite de chamadas atingido; a coleta espera o próximo ciclo";
  return null;
}

export function tiktokClienteReal(token: string): TikTokCliente {
  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const u = new URL(`${API}/${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const r = await fetch(u, { headers: { "Access-Token": token }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const j = (await r.json()) as { code: number; message: string; data: T };
    if (!r.ok || j.code !== 0) {
      const humano = explicarErroTikTok(j.code, j.message ?? "");
      throw new Error(`${humano ? `${humano}. ` : ""}TikTok ${path}: ${j.message ?? r.status} [code ${j.code ?? r.status}]`);
    }
    return j.data;
  }
  const conta = (id: string) => lembrar(`tiktok:conta:${id}`, async () => {
    const d = await get<{ list: { advertiser_id: string; name: string; currency: string; timezone: string }[] }>("advertiser/info/", { advertiser_ids: JSON.stringify([id]), fields: JSON.stringify(["advertiser_id", "name", "currency", "timezone"]) });
    const a = d.list?.[0]; if (!a) throw new Error(`TikTok: conta ${id} não encontrada para este token`);
    return { id: a.advertiser_id, nome: a.name, moeda: a.currency, fuso: a.timezone };
  }, { ttlMs: 24 * 3_600_000, rotulo: "conta TikTok" });
  return {
    conta,
    async relatorio(advertiserId, deDia, ateDia) {
      const linhas: TikTokLinha[] = [];
      for (let page = 1; page <= 10; page++) {
        const d = await get<{ list: { dimensions: { campaign_id: string; stat_time_hour?: string; stat_time_day?: string }; metrics: { spend: string; campaign_name: string } }[]; page_info: { total_page: number } }>("report/integrated/get/", {
          advertiser_id: advertiserId, report_type: "BASIC", data_level: "AUCTION_CAMPAIGN",
          dimensions: JSON.stringify(["campaign_id", "stat_time_hour"]), metrics: JSON.stringify(["spend", "campaign_name"]),
          start_date: deDia, end_date: ateDia, page: String(page), page_size: "1000",
        });
        for (const x of d.list ?? []) linhas.push({ campaign_id: x.dimensions.campaign_id, campaign_name: x.metrics.campaign_name, spend: Number(x.metrics.spend), stat_time: x.dimensions.stat_time_hour ?? x.dimensions.stat_time_day ?? deDia });
        if (page >= (d.page_info?.total_page ?? 1)) break;
      }
      return { linhas, granularidade: "hora" };
    },
    async campanhas(advertiserId) {
      const d = await get<{ list: { campaign_id: string; campaign_name: string; operation_status: string; secondary_status?: string }[] }>("campaign/get/", { advertiser_id: advertiserId, page_size: "1000", fields: JSON.stringify(["campaign_id", "campaign_name", "operation_status", "secondary_status"]) });
      return (d.list ?? []).map((c) => ({ id: c.campaign_id, name: c.campaign_name, status: c.operation_status === "ENABLE" ? "ACTIVE" : "PAUSED" }));
    },
  };
}

/** Converte um valor na moeda da conta para BRL pelo câmbio do dia (Brasília). */
export async function paraBrl(valor: number, moeda: string, quando: Date): Promise<{ brl: number; taxa: number } | null> {
  const m = moeda.toUpperCase();
  if (m === "BRL") return { brl: valor, taxa: 1 };
  const par = m === "USD" ? "USDBRL" : m === "MXN" ? "MXNBRL" : null;
  if (!par) return null;
  const t = await taxaDoDia(par, diaBrasilia(quando));
  return t ? { brl: valor * t.taxa, taxa: t.taxa } : null;
}

const TZ_APP = process.env.APP_TZ ?? "America/Sao_Paulo";
const diaNoFuso = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function coletarTikTok(cliente: TikTokCliente, contas: string[], agora = new Date(), horasRetro?: number) {
  return executarColeta("tiktok", async () => {
    const marco = await marcoZeroAtual();
    const frentes = await db.select({ id: schema.frentes.id, regraCampanha: schema.frentes.regraCampanha }).from(schema.frentes).orderBy(schema.frentes.ordem);
    const [anterior] = await db.select({ ok: schema.coletas.ok }).from(schema.coletas).where(eq(schema.coletas.fonte, "tiktok")).orderBy(desc(schema.coletas.iniciadaEm)).limit(1).offset(1);
    const plano = horasRetro != null ? { refazOntem: true, buscaCampanhas: true, motivo: `janela manual de ${horasRetro} h` } : planoDoCiclo(agora, anterior ? anterior.ok === false : false);
    const inicioHoje = fromZonedTime(`${diaNoFuso(agora, TZ_APP)}T00:00:00`, TZ_APP);
    const de = horasRetro != null ? new Date(agora.getTime() - horasRetro * 3_600_000) : plano.refazOntem ? new Date(inicioHoje.getTime() - 86_400_000) : inicioHoje;
    const detalhe: Record<string, unknown> = { plano: { ...plano, desde: de.toISOString() } };
    let total = 0; const erros: string[] = []; let semCambio = false;
    for (const id of contas) {
      try {
        const conta = await cliente.conta(id);
        const { linhas, granularidade } = await cliente.relatorio(id, diaNoFuso(de, conta.fuso), diaNoFuso(agora, conta.fuso));
        const camps = plano.buscaCampanhas ? await cliente.campanhas(id) : [];
        for (const c of camps) {
          const frenteId = await resolverFrente(c.name, frentes);
          await db.insert(schema.campanhas).values({ contaId: `tiktok:${id}`, campanhaId: c.id, nome: c.name, status: c.status, numeroWhatsapp: extrairNumeroWhatsapp(c.name), frenteId, atualizadoEm: new Date() })
            .onConflictDoUpdate({ target: [schema.campanhas.contaId, schema.campanhas.campanhaId], set: { nome: c.name, status: c.status, numeroWhatsapp: extrairNumeroWhatsapp(c.name), frenteId, atualizadoEm: new Date() } });
        }
        const rows: NovoLancamento[] = [];
        for (const l of linhas) {
          const instante = fromZonedTime(l.stat_time.length > 10 ? l.stat_time.replace(" ", "T") : `${l.stat_time}T00:00:00`, conta.fuso);
          if (instante < de && granularidade === "hora") continue;
          if (!Number.isFinite(l.spend)) continue;
          const conv = await paraBrl(l.spend, conta.moeda, instante);
          if (!conv) { semCambio = true; continue; }
          rows.push({
            fonte: "tiktok", tipo: "gasto_anuncio", chaveNatural: `tiktok|${id}|${l.campaign_id}|${instante.toISOString()}`,
            instante, granularidade, descricao: l.campaign_name, valorOriginal: String(l.spend), moeda: conta.moeda, valorBrl: String(conv.brl), taxaCambio: String(conv.taxa),
            contaId: `tiktok:${id}`, campanhaId: l.campaign_id, historico: instante < marco, payload: l,
          });
        }
        total += await upsertLancamentos(rows);
        detalhe[id] = { nome: conta.nome, moeda: conta.moeda, fuso: conta.fuso, linhas: linhas.length, granularidade };
      } catch (e) { const msg = e instanceof Error ? e.message : String(e); erros.push(`${id}: ${msg}`); detalhe[id] = { erro: msg }; }
    }
    if (semCambio) await abrirAviso("sem_cambio", "tiktok", "Sem taxa de câmbio para converter o gasto do TikTok; rode a coleta de câmbio.");
    if (erros.length === contas.length) throw new Error(erros.join(" | "));
    if (erros.length) await abrirAviso("coleta_parcial", "tiktok", `TikTok: ${erros.join(" | ")}`); else await resolverAvisos("tiktok", "coleta_parcial");
    return { registros: total, detalhe };
  });
}

// ---------- CSV do Ads Manager (alternativa sem API) ----------
export type LinhaCsvTikTok = { campanha: string; quando: Date; granularidade: "hora" | "dia"; custo: number; campanhaId: string | null };

/**
 * Lê o CSV/relatório exportado do TikTok Ads Manager (pt ou en): colunas com campanha, data (e hora, se o relatório for por hora) e custo.
 * Cabeçalhos aceitos: "Nome da campanha"/"Campaign name", "Data"/"Date"/"Por dia"/"By day", "Hora"/"Hour"/"Por hora", "Custo"/"Cost"/"Spend",
 * "ID da campanha"/"Campaign ID" (opcional). Datas "AAAA-MM-DD" ou "DD/MM/AAAA"; hora "13:00" ou "2026-10-11 13:00".
 */
export function lerCsvTikTok(csv: string, tz = TZ_APP): LinhaCsvTikTok[] {
  const t = csv.replace(/^﻿/, "");
  const primeira = t.split(/\r?\n/)[0] ?? "";
  const sep = primeira.includes("\t") ? "\t" : (primeira.match(/;/g) ?? []).length >= (primeira.match(/,/g) ?? []).length ? ";" : ",";
  const linhas = t.split(/\r?\n/).filter((l) => l.trim()).map((l) => dividir(l, sep));
  if (linhas.length < 2) return [];
  const cab = linhas[0].map((h) => h.trim().toLowerCase());
  const idx = (...res: RegExp[]) => cab.findIndex((h) => res.some((r) => r.test(h)));
  const iNome = idx(/^(nome da )?campanha$|^campaign( name)?$/), iId = idx(/id da campanha|campaign id/), iData = idx(/^(data|date|dia|day|por dia|by day|stat_?time_?day)$/), iHora = idx(/^(hora|hour|por hora|by hour|stat_?time_?hour|time)$/), iCusto = idx(/^(custo|cost|spend|gasto|total cost|valor gasto)/);
  if (iNome < 0 || iCusto < 0 || (iData < 0 && iHora < 0)) return [];
  const num = (s: string) => { const limpo = s.replace(/[^\d,.-]/g, ""); const n = Number(limpo.includes(",") && !/\.\d{1,2}$/.test(limpo) ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
  const out: LinhaCsvTikTok[] = [];
  for (const r of linhas.slice(1)) {
    const campanha = (r[iNome] ?? "").trim(); if (!campanha || /^total/i.test(campanha)) continue;
    const custo = num(r[iCusto] ?? ""); if (custo == null) continue;
    const dataTxt = (iData >= 0 ? r[iData] : "") ?? ""; const horaTxt = (iHora >= 0 ? r[iHora] : "") ?? "";
    const dia = (dataTxt.match(/(\d{4})-(\d{2})-(\d{2})/) ?? horaTxt.match(/(\d{4})-(\d{2})-(\d{2})/))?.slice(1, 4) ?? dataTxt.match(/(\d{2})\/(\d{2})\/(\d{4})/)?.slice(1, 4).reverse();
    if (!dia) continue;
    const hora = horaTxt.match(/(\d{2}):(\d{2})/)?.[1];
    const quando = fromZonedTime(`${dia[0]}-${dia[1]}-${dia[2]}T${hora ?? "00"}:00:00`, tz);
    out.push({ campanha, campanhaId: iId >= 0 ? (r[iId] ?? "").trim() || null : null, quando, granularidade: hora != null ? "hora" : "dia", custo });
  }
  return out;
}

function dividir(linha: string, sep: string): string[] {
  const out: string[] = []; let campo = ""; let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) { if (c === '"') { if (linha[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c; }
    else if (c === '"') aspas = true; else if (c === sep) { out.push(campo); campo = ""; } else campo += c;
  }
  out.push(campo); return out;
}

/** Grava as linhas do CSV como lançamentos TikTok (idempotente por campanha+instante). Moeda informada pelo usuário. */
export async function importarCsvTikTok(linhas: LinhaCsvTikTok[], moeda: string, contaRotulo = "csv") {
  return executarColeta("tiktok", async () => {
    const marco = await marcoZeroAtual();
    const frentes = await db.select({ id: schema.frentes.id, regraCampanha: schema.frentes.regraCampanha }).from(schema.frentes).orderBy(schema.frentes.ordem);
    const rows: NovoLancamento[] = []; let semCambio = 0;
    for (const l of linhas) {
      const conv = await paraBrl(l.custo, moeda, l.quando);
      if (!conv) { semCambio++; continue; }
      const campanhaId = l.campanhaId ?? l.campanha;
      await db.insert(schema.campanhas).values({ contaId: `tiktok:${contaRotulo}`, campanhaId, nome: l.campanha, status: null, numeroWhatsapp: extrairNumeroWhatsapp(l.campanha), frenteId: await resolverFrente(l.campanha, frentes), atualizadoEm: new Date() })
        .onConflictDoUpdate({ target: [schema.campanhas.contaId, schema.campanhas.campanhaId], set: { nome: l.campanha, atualizadoEm: new Date() } });
      rows.push({
        fonte: "tiktok", tipo: "gasto_anuncio", chaveNatural: `tiktok|${contaRotulo}|${campanhaId}|${l.quando.toISOString()}`, instante: l.quando, granularidade: l.granularidade,
        descricao: l.campanha, valorOriginal: String(l.custo), moeda: moeda.toUpperCase(), valorBrl: String(conv.brl), taxaCambio: String(conv.taxa),
        contaId: `tiktok:${contaRotulo}`, campanhaId, historico: l.quando < marco, payload: { origem: "csv_tiktok" },
      });
    }
    if (semCambio) throw new Error(`${semCambio} linha(s) sem taxa de câmbio ${moeda}→BRL para a data; rode a coleta de câmbio e importe de novo`);
    return { registros: await upsertLancamentos(rows), detalhe: { origem: "csv", moeda, linhas: linhas.length } };
  });
}
