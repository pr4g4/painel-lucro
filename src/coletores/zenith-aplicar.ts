/**
 * Aplica um evento da Zenith (já autenticado) na tabela `vendas`, e reprocessa eventos que falharam
 * (ex.: "sem câmbio MXN→BRL" antes de a PTAX existir). Usado pelo webhook, pelo coletor de câmbio e por /api/zenith/reprocessar.
 */
import { and, eq, like, sql } from "drizzle-orm";
import { db, schema, executar } from "@/db";
import { interpretarEvento, type EventoZenith } from "./zenith-webhook";
import { normalizarVenda, acharVendaZenith, acharVendaPorHeuristica, mesclarIds } from "./zenith";
import { abrirAviso, resolverAvisos } from "./base";

export async function aplicarEvento(ev: EventoZenith, tipoHeader: string | null, timestampHeader: string | null, eventoId: string): Promise<{ resultado: string; vendaIdOrigem: string | null; ok: boolean }> {
  const r = interpretarEvento(ev, tipoHeader, timestampHeader, eventoId);
  if (!r.ok) {
    if (r.desconhecido) await abrirAviso("formato_desconhecido", "zenith", `Webhook da Zenith com formato desconhecido (evento ${eventoId}): ${r.motivo}. Payload guardado em zenith_eventos.`);
    return { resultado: `ignorado: ${r.motivo}`, vendaIdOrigem: null, ok: true };
  }
  const nova = await normalizarVenda(r.venda, "zenith");
  let existente = await acharVendaZenith([r.identidade, ...(r.venda.ids ?? [])]);
  let viaHeuristica = false;
  if (!existente && nova.status === "aprovada") {
    const { familia = null, pagador = null } = (r.venda.payload as { familia?: string; pagador?: string | null }) ?? {};
    existente = await acharVendaPorHeuristica({ id: r.identidade, bruto: r.venda.bruto, moeda: r.venda.moeda, aprovadaEm: nova.aprovadaEm, familia, ids: r.venda.ids, pagador });
    viaHeuristica = !!existente;
  }
  if (existente) await mesclarIds(existente.id, [r.identidade, ...(r.venda.ids ?? [])], (r.venda.payload as { familia?: string; pagador?: string | null }) ?? {});
  let resultado: string;
  if (!existente) {
    if (nova.status === "reembolsada" || nova.status === "chargeback") {
      nova.historico = true;
      await abrirAviso("reembolso_sem_venda", "zenith", `Reembolso/chargeback de venda desconhecida (${r.identidade}); guardado como histórico, fora dos totais.`);
    }
    await executar((d) => d.insert(schema.vendas).values(nova));
    resultado = `venda ${r.identidade} criada: ${nova.status} (${r.descricao})`;
  } else if (nova.status === "aprovada") {
    if (existente.status === "pendente") {
      await executar((d) => d.update(schema.vendas).set({ status: "aprovada", aprovadaEm: nova.aprovadaEm, brutoOriginal: nova.brutoOriginal, taxaCambio: nova.taxaCambio, brutoBrl: nova.brutoBrl, taxaPctBrl: nova.taxaPctBrl, taxaFixaBrl: nova.taxaFixaBrl, cambioPctBrl: nova.cambioPctBrl, liquidoBrl: nova.liquidoBrl, reservaBrl: nova.reservaBrl, historico: nova.historico, payload: nova.payload, coletadoEm: new Date() }).where(eq(schema.vendas.id, existente.id)));
      resultado = `venda ${r.identidade} aprovada (era pendente) via ${r.descricao}`;
    } else resultado = `venda ${r.identidade} já registrada como ${existente.idOrigem} (${existente.status})${viaHeuristica ? " [mesmo valor/moeda em até 10 min, família diferente]" : ""}; ${r.descricao} não somou de novo`;
  } else if (nova.status === "pendente") {
    resultado = `venda ${r.identidade} já ${existente.status}; pending ignorado`;
  } else {
    await executar((d) => d.update(schema.vendas).set({ status: nova.status, reembolsadaEm: nova.reembolsadaEm, coletadoEm: new Date() }).where(eq(schema.vendas.id, existente.id)));
    resultado = `venda ${r.identidade} marcada ${nova.status} em ${nova.reembolsadaEm?.toISOString()}`;
  }
  return { resultado, vendaIdOrigem: r.identidade, ok: true };
}

/** Reprocessa eventos autenticados que terminaram em "erro: …" (ex.: sem câmbio). Idempotente: usa a mesma dedup do webhook. */
export async function reprocessarEventosZenith(limite = 200): Promise<{ tentados: number; ok: number; aindaComErro: number; detalhes: string[] }> {
  const pendentes = await executar((d) => d.select().from(schema.zenithEventos)
    .where(and(eq(schema.zenithEventos.assinaturaOk, true), eq(schema.zenithEventos.processado, false), like(schema.zenithEventos.resultado, "erro:%")))
    .orderBy(schema.zenithEventos.recebidoEm).limit(limite), 20000, "eventos com erro");
  let ok = 0; const detalhes: string[] = [];
  for (const e of pendentes) {
    const ev = e.payload as EventoZenith & { corpoBruto?: string; _assinatura?: string };
    const ts = e.timestampZenith ? String(Math.floor(e.timestampZenith.getTime() / 1000)) : null;
    try {
      const r = await aplicarEvento(ev, e.tipo, ts, e.eventoId);
      await executar((d) => d.update(schema.zenithEventos).set({ processado: true, resultado: `reprocessado: ${r.resultado}`, vendaIdOrigem: r.vendaIdOrigem }).where(eq(schema.zenithEventos.id, e.id)));
      ok++; detalhes.push(`${e.eventoId}: ${r.resultado}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await executar((d) => d.update(schema.zenithEventos).set({ resultado: `erro: ${msg}` }).where(eq(schema.zenithEventos.id, e.id)));
      detalhes.push(`${e.eventoId}: ainda com erro: ${msg}`);
    }
  }
  if (ok > 0) {
    await resolverAvisos("zenith", "coleta_falhou");
    await executar((d) => d.insert(schema.coletas).values({ fonte: "zenith", terminadaEm: new Date(), ok: true, registros: ok, detalhe: { reprocessados: ok } }));
  }
  return { tentados: pendentes.length, ok, aindaComErro: pendentes.length - ok, detalhes };
}

/** Quantas taxas há por par e a data da última (para diagnóstico). */
export async function resumoCambio() {
  const rows = await executar((d) => d.execute(sql`select par, count(*)::int as n, min(dia)::text as primeira, max(dia)::text as ultima from cambio group by par order by par`)) as unknown as { par: string; n: number; primeira: string; ultima: string }[];
  return rows;
}

export { db };

/**
 * Cria a venda a partir de um evento já guardado em zenith_eventos, SEM a mesclagem por valor/hora (uso: quando a conferência
 * com a Zenith mostra que o evento era outra venda). Idempotente: se já existe venda com qualquer id do evento, não cria;
 * se o webhook reenviar o evento depois, cai na mesma dedup por id.
 */
export async function criarVendaDoEvento(eventoId: string): Promise<{ ok: boolean; resultado: string }> {
  const [e] = await executar((d) => d.select().from(schema.zenithEventos).where(eq(schema.zenithEventos.eventoId, eventoId)).limit(1), 10000, "evento");
  if (!e) return { ok: false, resultado: "evento não encontrado" };
  if (!e.assinaturaOk) return { ok: false, resultado: "evento rejeitado na assinatura; não pode virar venda" };
  const pl = (e.payload ?? {}) as EventoZenith & { corpoBruto?: string };
  const ev: EventoZenith = pl.corpoBruto && !pl.data ? (() => { try { return JSON.parse(pl.corpoBruto!); } catch { return pl; } })() : pl;
  const r = interpretarEvento(ev, e.tipo, e.timestampZenith ? String(e.timestampZenith.getTime()) : null, eventoId);
  if (!r.ok) return { ok: false, resultado: `evento não interpretável: ${r.motivo}` };
  if (r.venda.status !== "aprovada" && r.venda.status !== "pendente") return { ok: false, resultado: `evento é ${r.venda.status}; só aprovação/pendência vira venda nova` };
  const meusIds = [r.identidade, ...(r.venda.ids ?? [])];
  const existente = await acharVendaZenith(meusIds);
  if (existente && meusIds.includes(existente.idOrigem)) return { ok: true, resultado: `já existe venda ${existente.idOrigem} (${existente.status}) com esse id; nada criado` };
  if (existente) {
    // o evento tinha sido mesclado em outra venda: desfaz a ligação para que reenvios liguem à venda nova
    const pl = (existente.payload ?? {}) as Record<string, unknown>;
    const ids = (Array.isArray(pl.ids) ? (pl.ids as string[]) : []).filter((i) => !meusIds.includes(i));
    const familia = (r.venda.payload as { familia?: string })?.familia;
    const mesclas = (Array.isArray(pl.mesclas) ? (pl.mesclas as string[]) : []).filter((f) => f !== familia);
    await executar((d) => d.update(schema.vendas).set({ payload: { ...pl, ids, mesclas } }).where(eq(schema.vendas.id, existente.id)));
  }
  const nova = await normalizarVenda(r.venda, "zenith");
  nova.observacao = `criada a partir do evento ${eventoId} em ${new Date().toISOString()} (conferência com a Zenith); sem mesclagem por valor/hora`;
  await executar((d) => d.insert(schema.vendas).values(nova));
  await executar((d) => d.update(schema.zenithEventos).set({ processado: true, resultado: `${e.resultado ?? ""} | venda ${r.identidade} criada manualmente`.replace(/^ \| /, ""), vendaIdOrigem: r.identidade }).where(eq(schema.zenithEventos.id, e.id)));
  return { ok: true, resultado: `venda ${r.identidade} criada: ${nova.status} ${nova.moeda} ${nova.brutoOriginal}` };
}
