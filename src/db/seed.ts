/**
 * Seed idempotente: pode rodar quantas vezes quiser.
 *  - usuários erick (edita) e ian (vê) — senha inicial vem de ERICK_SENHA_INICIAL / IAN_SENHA_INICIAL;
 *    se faltar, gera uma aleatória e imprime UMA vez;
 *  - frentes; categorias; parâmetros com vigência desde o início do histórico;
 *  - ZapData como lançamento recorrente mensal (R$ 119, começa 02/10/2026).
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { DateTime } from "luxon";
import { db, pool, schema } from "./index";
import { gerarHashSenha } from "../lib/senha";
import { FUSO_BRASILIA, INICIO_HISTORICO } from "../lib/tempo";
import { CHAVES } from "../lib/parametros";

async function garantirUsuario(usuario: string, nome: string, papel: "edita" | "ve", senhaEnv: string) {
  const existe = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario)).limit(1);
  if (existe.length) return;
  let senha = process.env[senhaEnv];
  let gerada = false;
  if (!senha) {
    senha = randomBytes(9).toString("base64url");
    gerada = true;
  }
  await db.insert(schema.usuarios).values({ usuario, nome, papel, senhaHash: await gerarHashSenha(senha) });
  console.log(`usuário criado: ${usuario} (${papel})${gerada ? ` — senha inicial gerada: ${senha}  <- anote e troque no app` : ""}`);
}

async function garantirParametro(p: {
  chave: string; valor?: number; texto?: string; moeda?: string; descricao: string;
}) {
  const aberto = await db
    .select()
    .from(schema.parametros)
    .where(and(eq(schema.parametros.chave, p.chave), isNull(schema.parametros.vigenciaFim)))
    .limit(1);
  if (aberto.length) return;
  await db.insert(schema.parametros).values({
    chave: p.chave,
    valor: p.valor == null ? null : String(p.valor),
    texto: p.texto ?? null,
    moeda: p.moeda ?? null,
    vigenciaInicio: INICIO_HISTORICO,
    descricao: p.descricao,
  });
  console.log(`parâmetro: ${p.chave} = ${p.valor ?? p.texto}`);
}

async function main() {
  await garantirUsuario("erick", "Erick", "edita", "ERICK_SENHA_INICIAL");
  await garantirUsuario("ian", "Ian", "ve", "IAN_SENHA_INICIAL");

  for (const f of [
    { nome: "Fotos IA MX", regraCampanha: "REST\\.?\\s*FOTO|FOTO", ativa: true },
    { nome: "Cenas Ligeras", regraCampanha: "CENAS|LIGERAS", ativa: false },
    { nome: "Embarazo", regraCampanha: "EMBARAZO", ativa: false },
  ]) {
    await db.insert(schema.frentes).values(f).onConflictDoNothing();
  }

  const categorias = ["tráfego pago", "softwares e aplicativos", "IA", "contabilidade", "operação", "outros"];
  for (const [i, nome] of categorias.entries()) {
    await db.insert(schema.categorias).values({ nome, ordem: i }).onConflictDoNothing();
  }

  await garantirParametro({ chave: CHAVES.META_IMPOSTO_PCT, valor: 12.15, descricao: "Imposto sobre gasto da Meta (%). Fator = 1 ÷ (1 − 12,15%) = 1,1383" });
  await garantirParametro({ chave: CHAVES.ZENITH_TAXA_PCT, valor: 7.99, descricao: "Taxa percentual da Zenith por venda (%)" });
  await garantirParametro({ chave: CHAVES.ZENITH_TAXA_FIXA_MXN, valor: 5, moeda: "MXN", descricao: "Taxa fixa da Zenith por venda em MXN" });
  await garantirParametro({ chave: CHAVES.ZENITH_TAXA_FIXA_BRL, valor: 5, moeda: "BRL", descricao: "Taxa fixa da Zenith por venda em BRL" });
  await garantirParametro({ chave: CHAVES.ZENITH_CAMBIO_PCT, valor: 2, descricao: "Taxa de câmbio da Zenith (%)" });
  await garantirParametro({ chave: CHAVES.IMPOSTO_LUCRO_PCT, valor: 8, descricao: "Imposto sobre lucro (%), zero se a base for negativa" });
  await garantirParametro({ chave: CHAVES.IMPOSTO_LUCRO_BASE, texto: "lucro_bruto", descricao: "Base do imposto: lucro_bruto | receita_liquida | receita_menos_meta" });

  // ZapData: recorrente mensal, começa 02/10/2026 00:00 Brasília, sem fim.
  const [catSoft] = await db.select().from(schema.categorias).where(eq(schema.categorias.nome, "softwares e aplicativos"));
  const jaTem = await db.select().from(schema.lancamentosManuais).where(eq(schema.lancamentosManuais.descricao, "ZapData (mensalidade)")).limit(1);
  if (!jaTem.length) {
    const [erick] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, "erick"));
    await db.insert(schema.lancamentosManuais).values({
      tipo: "saida",
      moeda: "BRL",
      valor: "119",
      categoriaId: catSoft.id,
      descricao: "ZapData (mensalidade)",
      frequencia: "mensal",
      comecaEm: DateTime.fromISO("2026-10-02T00:00:00", { zone: FUSO_BRASILIA }).toJSDate(),
      status: "ativo",
      criadoPor: erick?.id,
    });
    console.log("lançamento recorrente: ZapData R$ 119/mês a partir de 02/10/2026");
  }

  console.log("seed concluído");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
