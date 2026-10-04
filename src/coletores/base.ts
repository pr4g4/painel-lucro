import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { InferInsertModel } from "drizzle-orm";

export type NovoLancamento = InferInsertModel<typeof schema.lancamentos>;
export type NovaVenda = InferInsertModel<typeof schema.vendas>;

export type ResultadoColeta = { fonte: string; ok: boolean; registros: number; erro?: string; detalhe?: Record<string, unknown> };

/** Envolve uma coleta: registra início/fim, erro, e abre aviso após 3 falhas seguidas. */
export async function executarColeta(fonte: string, fn: () => Promise<{ registros: number; detalhe?: Record<string, unknown> }>): Promise<ResultadoColeta> {
  const [c] = await db.insert(schema.coletas).values({ fonte }).returning({ id: schema.coletas.id });
  try {
    const r = await fn();
    await db.update(schema.coletas).set({ terminadaEm: new Date(), ok: true, registros: r.registros, detalhe: r.detalhe ?? null }).where(eq(schema.coletas.id, c.id));
    for (const t of ["coleta_falhou", "fonte_nao_configurada", "sem_cambio", "webhook_rejeitado"]) await resolverAvisos(fonte, t);
    return { fonte, ok: true, registros: r.registros, detalhe: r.detalhe };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await db.update(schema.coletas).set({ terminadaEm: new Date(), ok: false, erro }).where(eq(schema.coletas.id, c.id));
    const ultimas = await db.select({ ok: schema.coletas.ok }).from(schema.coletas).where(eq(schema.coletas.fonte, fonte)).orderBy(desc(schema.coletas.iniciadaEm)).limit(3);
    if (ultimas.length === 3 && ultimas.every((u) => u.ok === false)) {
      await abrirAviso("coleta_falhou", fonte, `Coleta de ${fonte} falhou 3 vezes seguidas: ${erro}`);
    }
    return { fonte, ok: false, registros: 0, erro };
  }
}

export async function abrirAviso(tipo: string, fonte: string | null, mensagem: string) {
  const existente = await db.select({ id: schema.avisos.id }).from(schema.avisos)
    .where(and(eq(schema.avisos.tipo, tipo), fonte ? eq(schema.avisos.fonte, fonte) : isNull(schema.avisos.fonte), isNull(schema.avisos.resolvidoEm))).limit(1);
  if (existente.length) {
    await db.update(schema.avisos).set({ mensagem }).where(eq(schema.avisos.id, existente[0].id));
  } else {
    await db.insert(schema.avisos).values({ tipo, fonte, mensagem });
  }
}

export async function resolverAvisos(fonte: string, tipo: string) {
  await db.update(schema.avisos).set({ resolvidoEm: new Date() })
    .where(and(eq(schema.avisos.fonte, fonte), eq(schema.avisos.tipo, tipo), isNull(schema.avisos.resolvidoEm)));
}

/** Upsert idempotente por chave natural: rodar duas vezes não duplica nem muda totais. */
export async function upsertLancamentos(rows: NovoLancamento[]): Promise<number> {
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500);
    await db.insert(schema.lancamentos).values(lote).onConflictDoUpdate({
      target: schema.lancamentos.chaveNatural,
      set: {
        valorOriginal: sql`excluded.valor_original`, valorBrl: sql`excluded.valor_brl`, taxaCambio: sql`excluded.taxa_cambio`,
        descricao: sql`excluded.descricao`, estimado: sql`excluded.estimado`, payload: sql`excluded.payload`, coletadoEm: new Date(),
      },
    });
  }
  return rows.length;
}

export async function upsertVendas(rows: NovaVenda[]): Promise<number> {
  if (!rows.length) return 0;
  for (const v of rows) {
    await db.insert(schema.vendas).values(v).onConflictDoUpdate({
      target: [schema.vendas.fonte, schema.vendas.idOrigem],
      set: {
        status: v.status, aprovadaEm: v.aprovadaEm ?? null, reembolsadaEm: v.reembolsadaEm ?? null, produto: v.produto ?? null,
        brutoOriginal: v.brutoOriginal, taxaCambio: v.taxaCambio, brutoBrl: v.brutoBrl, taxaPctBrl: v.taxaPctBrl, taxaFixaBrl: v.taxaFixaBrl,
        cambioPctBrl: v.cambioPctBrl, liquidoBrl: v.liquidoBrl, reservaBrl: v.reservaBrl, reservaLiberadaEm: v.reservaLiberadaEm ?? null,
        historico: v.historico, payload: v.payload ?? null, coletadoEm: new Date(),
      },
    });
  }
  return rows.length;
}

/** Taxa de câmbio do dia (ou a última anterior); null se não houver nenhuma. */
export async function taxaDoDia(par: "USDBRL" | "MXNBRL", dia: string): Promise<{ taxa: number; provisoria: boolean } | null> {
  const [r] = await db.select().from(schema.cambio).where(and(eq(schema.cambio.par, par), sql`${schema.cambio.dia} <= ${dia}`)).orderBy(desc(schema.cambio.dia)).limit(1);
  return r ? { taxa: Number(r.taxa), provisoria: r.provisoria || r.dia !== dia } : null;
}

export function diaBrasilia(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TZ ?? "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export async function marcoZeroAtual(): Promise<Date> {
  const [p] = await db.select().from(schema.parametros).where(and(eq(schema.parametros.chave, "marco_zero"), isNull(schema.parametros.vigenciaFim))).limit(1);
  return p ? new Date(p.valor) : new Date("2026-10-03T03:00:00Z");
}
