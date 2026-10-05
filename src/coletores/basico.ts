/**
 * Garante os cadastros básicos (parâmetros com valor padrão, frentes, categorias, ZapData recorrente, referência de saldo OpenAI).
 * Idempotente: só insere o que não existe; nunca altera o que já está lá. Roda no início de cada ciclo de coleta,
 * então um deploy que cria parâmetro novo entra em vigor sozinho, sem ninguém abrir /api/seed.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PARAMETROS_PADRAO } from "@/lib/calculo";

export async function garantirBasico(): Promise<string[]> {
  const feito: string[] = [];
  const inicio = new Date("2026-09-01T03:00:00Z");
  const existentes = new Set((await db.select({ chave: schema.parametros.chave }).from(schema.parametros)).map((p) => p.chave));
  for (const [chave, { valor, observacao }] of Object.entries(PARAMETROS_PADRAO)) {
    if (existentes.has(chave)) continue;
    await db.insert(schema.parametros).values({ chave, valor, observacao, vigenciaInicio: inicio });
    feito.push(`parâmetro ${chave} = ${valor}`);
  }
  for (const f of [{ nome: "Fotos IA MX", regraCampanha: "REST\\.?\\s*FOTO|FOTOS? IA", ativa: true, ordem: 1 }, { nome: "Cenas Ligeras", regraCampanha: "CENAS\\s*LIGERAS", ativa: false, ordem: 2 }, { nome: "Embarazo", regraCampanha: "EMBARAZO", ativa: false, ordem: 3 }])
    await db.insert(schema.frentes).values(f).onConflictDoNothing();
  for (const [nome, linhaDre] of [["ZapData", "zapdata"], ["tráfego pago", "operacao"], ["softwares e aplicativos", "operacao"], ["IA", "ia"], ["contabilidade", "operacao"], ["operação", "operacao"], ["outros", "operacao"]] as const)
    await db.insert(schema.categorias).values({ nome, linhaDre }).onConflictDoNothing();
  const [catZap] = await db.select().from(schema.categorias).where(eq(schema.categorias.nome, "ZapData"));
  const [zap] = await db.select().from(schema.lancamentosManuais).where(eq(schema.lancamentosManuais.descricao, "ZapData mensalidade")).limit(1);
  if (!zap && catZap) { await db.insert(schema.lancamentosManuais).values({ tipo: "saida", moeda: "BRL", valor: "119", categoriaId: catZap.id, descricao: "ZapData mensalidade", frequencia: "mensal", comecaEm: new Date("2026-10-02T03:00:00Z"), ativo: true }); feito.push("ZapData recorrente"); }
  const ref = await db.insert(schema.lancamentos).values({ fonte: "openai", tipo: "saldo_ref", chaveNatural: "openai|saldo_ref|2026-10-05T02:48:00.000Z", instante: new Date("2026-10-05T02:48:00.000Z"), granularidade: "minuto", descricao: "OpenAI saldo conferido no painel de Billing: US$ 8.03", valorOriginal: "8.03", moeda: "USD", valorBrl: "0", taxaCambio: "0", historico: false, estimado: false, payload: { origem: "seed" } }).onConflictDoNothing().returning({ id: schema.lancamentos.id });
  if (ref.length) feito.push("referência OpenAI 8,03");
  return feito;
}
