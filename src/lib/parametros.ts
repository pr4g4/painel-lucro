import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";

/** Chaves conhecidas. Novas chaves podem ser criadas pela tela sem mexer aqui. */
export const CHAVES = {
  META_IMPOSTO_PCT: "meta_imposto_pct",
  ZENITH_TAXA_PCT: "zenith_taxa_pct",
  ZENITH_TAXA_FIXA_MXN: "zenith_taxa_fixa_mxn",
  ZENITH_TAXA_FIXA_BRL: "zenith_taxa_fixa_brl",
  ZENITH_CAMBIO_PCT: "zenith_cambio_pct",
  IMPOSTO_LUCRO_PCT: "imposto_lucro_pct",
  IMPOSTO_LUCRO_BASE: "imposto_lucro_base", // texto: lucro_bruto | receita_liquida | receita_menos_meta
  KIE_USD_POR_CREDITO: "kie_usd_por_credito",
} as const;

export type ChaveParametro = (typeof CHAVES)[keyof typeof CHAVES];

export type Parametro = typeof schema.parametros.$inferSelect;

/**
 * Devolve o parâmetro vigente em `instante`: vigencia_inicio <= instante < vigencia_fim.
 * Se houver sobreposição (não deveria), vence o de início mais recente.
 * Devolve null se nada vige naquele instante — o chamador mostra "dado indisponível".
 */
export async function parametroVigente(chave: string, instante: Date): Promise<Parametro | null> {
  const linhas = await db
    .select()
    .from(schema.parametros)
    .where(
      and(
        eq(schema.parametros.chave, chave),
        lte(schema.parametros.vigenciaInicio, instante),
        or(isNull(schema.parametros.vigenciaFim), gt(schema.parametros.vigenciaFim, instante)),
      ),
    )
    .orderBy(desc(schema.parametros.vigenciaInicio))
    .limit(1);
  return linhas[0] ?? null;
}

export async function valorVigente(chave: string, instante: Date): Promise<number | null> {
  const p = await parametroVigente(chave, instante);
  return p?.valor == null ? null : Number(p.valor);
}

export async function textoVigente(chave: string, instante: Date): Promise<string | null> {
  const p = await parametroVigente(chave, instante);
  return p?.texto ?? null;
}

/**
 * Abre uma nova vigência a partir de `inicio`: fecha a linha aberta anterior
 * (vigencia_fim = inicio) e insere a nova. Período anterior a `inicio` não muda.
 */
export async function definirParametro(entrada: {
  chave: string;
  valor?: number | null;
  texto?: string | null;
  moeda?: string | null;
  inicio: Date;
  descricao?: string | null;
}) {
  return db.transaction(async (tx) => {
    const abertas = await tx
      .select()
      .from(schema.parametros)
      .where(and(eq(schema.parametros.chave, entrada.chave), isNull(schema.parametros.vigenciaFim)));
    for (const a of abertas) {
      if (a.vigenciaInicio.getTime() >= entrada.inicio.getTime()) {
        throw new Error(
          `Já existe vigência de ${entrada.chave} começando em ${a.vigenciaInicio.toISOString()}; informe um início posterior.`,
        );
      }
      await tx
        .update(schema.parametros)
        .set({ vigenciaFim: entrada.inicio })
        .where(eq(schema.parametros.id, a.id));
    }
    const [nova] = await tx
      .insert(schema.parametros)
      .values({
        chave: entrada.chave,
        valor: entrada.valor == null ? null : String(entrada.valor),
        texto: entrada.texto ?? null,
        moeda: entrada.moeda ?? null,
        vigenciaInicio: entrada.inicio,
        descricao: entrada.descricao ?? null,
      })
      .returning();
    return nova;
  });
}
