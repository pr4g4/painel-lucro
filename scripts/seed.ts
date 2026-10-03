/**
 * Seed: usuários (Erick edita, Ian vê), parâmetros com vigência, frentes, categorias e o recorrente do ZapData.
 * Com `--exemplo`, também grava dados simulados (Meta, OpenAI, kie, câmbio, Zenith) para ver as telas sem chave.
 * Uso: npm run seed            (produção: só o essencial)
 *      npm run seed -- --exemplo (desenvolvimento)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db, schema } = await import("../src/db");
  const { eq, and, isNull, sql } = await import("drizzle-orm");
  const { gerarHash } = await import("../src/lib/auth/senha");
  const { PARAMETROS_PADRAO } = await import("../src/lib/calculo");

  const exemplo = process.argv.includes("--exemplo");
  const inicioVigencia = new Date("2026-09-01T03:00:00Z");

  // usuários
  for (const [usuario, nome, papel, senhaEnv] of [["erick", "Erick", "edita", "SEED_SENHA_ERICK"], ["ian", "Ian", "ve", "SEED_SENHA_IAN"]] as const) {
    const senha = process.env[senhaEnv];
    const [existe] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario)).limit(1);
    if (existe) { console.log(`usuário ${usuario} já existe`); continue; }
    if (!senha) { console.log(`usuário ${usuario} NÃO criado: defina ${senhaEnv}`); continue; }
    await db.insert(schema.usuarios).values({ usuario, nome, papel, senhaHash: await gerarHash(senha) });
    console.log(`usuário ${usuario} criado (${papel})`);
  }

  // parâmetros (só cria os que não existem)
  for (const [chave, { valor, observacao }] of Object.entries(PARAMETROS_PADRAO)) {
    const [existe] = await db.select().from(schema.parametros).where(eq(schema.parametros.chave, chave)).limit(1);
    if (!existe) await db.insert(schema.parametros).values({ chave, valor, observacao, vigenciaInicio: inicioVigencia });
  }

  // frentes
  const frentes = [
    { nome: "Fotos IA MX", regraCampanha: "REST\\.?\\s*FOTO|FOTOS? IA", ativa: true, ordem: 1 },
    { nome: "Cenas Ligeras", regraCampanha: "CENAS\\s*LIGERAS", ativa: false, ordem: 2 },
    { nome: "Embarazo", regraCampanha: "EMBARAZO", ativa: false, ordem: 3 },
  ];
  for (const f of frentes) await db.insert(schema.frentes).values(f).onConflictDoNothing();

  // categorias (editáveis) e linha da DRE
  const cats = [
    ["ZapData", "zapdata"], ["tráfego pago", "operacao"], ["softwares e aplicativos", "operacao"], ["IA", "ia"], ["contabilidade", "operacao"], ["operação", "operacao"], ["outros", "operacao"],
  ] as const;
  for (const [nome, linhaDre] of cats) await db.insert(schema.categorias).values({ nome, linhaDre, ordem: 0 }).onConflictDoNothing();

  // ZapData: recorrente mensal, R$ 119, começa 02/10/2026 00:00 BRT, sem fim
  const [catZap] = await db.select().from(schema.categorias).where(eq(schema.categorias.nome, "ZapData"));
  const [zapExiste] = await db.select().from(schema.lancamentosManuais).where(eq(schema.lancamentosManuais.descricao, "ZapData mensalidade")).limit(1);
  if (!zapExiste) await db.insert(schema.lancamentosManuais).values({ tipo: "saida", moeda: "BRL", valor: "119", categoriaId: catZap.id, descricao: "ZapData mensalidade", frequencia: "mensal", comecaEm: new Date("2026-10-02T03:00:00Z"), ativo: true });

  if (exemplo) {
    const { coletarCambio } = await import("../src/coletores/cambio");
    const { coletarMeta } = await import("../src/coletores/meta");
    const { coletarOpenAI } = await import("../src/coletores/openai");
    const { coletarKie } = await import("../src/coletores/kie");
    const { importarVendasZenith } = await import("../src/coletores/zenith");
    const { metaSimulado, openaiSimulado, kieSimulado, cambioSimulado, vendasZenithExemplo } = await import("../src/coletores/simulados");

    // preço por crédito do kie (exemplo) — valor real é pendência
    const [kp] = await db.select().from(schema.parametros).where(and(eq(schema.parametros.chave, "kie_usd_por_credito"), isNull(schema.parametros.vigenciaFim))).limit(1);
    if (!kp) await db.insert(schema.parametros).values({ chave: "kie_usd_por_credito", valor: "0.005", observacao: "EXEMPLO: confirmar preço real por crédito na conta do Ian", vigenciaInicio: inicioVigencia });

    const agora = new Date();
    // câmbio para o período todo de exemplo
    await coletarCambio(cambioSimulado(), new Date("2026-09-20T15:00:00Z"));
    await coletarCambio(cambioSimulado(), new Date("2026-09-30T15:00:00Z"));
    await coletarCambio(cambioSimulado(), agora);
    console.log("câmbio ok");
    // Meta: do histórico (12/09) até agora
    console.log("meta", (await coletarMeta(metaSimulado({ agora }), ["act_240727500555671", "act_210256430938513"], agora, 24 * 22)).registros, "lançamentos");
    console.log("openai", (await coletarOpenAI(openaiSimulado(), "proj_cenas", agora, 3)).registros);
    // kie: três leituras (02/10 08h, 02/10 20h, agora): 3330 créditos × 0,005 = US$ 16,65 em 02/10
    await coletarKie(kieSimulado([10000, 6670, 6400]), new Date("2026-10-02T11:00:00Z"));
    await coletarKie(kieSimulado([6670, 6400]), new Date("2026-10-02T23:00:00Z"));
    await coletarKie(kieSimulado([6400]), agora);
    console.log("kie ok");
    console.log("zenith", (await importarVendasZenith(vendasZenithExemplo(agora))).registros, "vendas");
    // custo avulso de exemplo (hoje)
    const [catOp] = await db.select().from(schema.categorias).where(eq(schema.categorias.nome, "contabilidade"));
    await db.insert(schema.lancamentosManuais).values({ tipo: "saida", moeda: "BRL", valor: "45", categoriaId: catOp.id, descricao: "EXEMPLO: contador (avulso)", frequencia: "unica", comecaEm: new Date(agora.getTime() - 3_600_000), ativo: true }).onConflictDoNothing();
    const n = await db.execute(sql`select count(*)::int as n from lancamentos`);
    console.log("total lançamentos:", (n as unknown as { n: number }[])[0]?.n ?? n);
  }
  console.log("seed concluído");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
