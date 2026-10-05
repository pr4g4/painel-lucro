/**
 * Coletores com clientes simulados contra o banco local: rodar duas vezes não altera nenhum total (idempotência),
 * e os números de sanidade de 02/10 saem iguais aos conferidos.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";

const temBanco = !!process.env.DATABASE_URL;

describe.skipIf(!temBanco)("coletores (banco local)", () => {
  let db: typeof import("@/db").db; let schema: typeof import("@/db").schema;
  let mods: { coletarCambio: typeof import("@/coletores/cambio").coletarCambio; coletarMeta: typeof import("@/coletores/meta").coletarMeta; coletarOpenAI: typeof import("@/coletores/openai").coletarOpenAI; coletarKie: typeof import("@/coletores/kie").coletarKie; importarVendasZenith: typeof import("@/coletores/zenith").importarVendasZenith };
  let sim: typeof import("@/coletores/simulados");
  let dados: typeof import("@/lib/dados");
  const agora = new Date("2026-10-03T18:00:00Z"); // 15:00 BRT

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    mods = { ...(await import("@/coletores/cambio")), ...(await import("@/coletores/meta")), ...(await import("@/coletores/openai")), ...(await import("@/coletores/kie")), ...(await import("@/coletores/zenith")) };
    sim = await import("@/coletores/simulados");
    dados = await import("@/lib/dados");
    // limpa só as tabelas de coleta (mantém usuários/parâmetros do seed)
    await db.execute(sql`truncate lancamentos, vendas, campanhas, cambio, coletas, avisos restart identity`);
    await db.execute(sql`insert into parametros (chave, valor, vigencia_inicio) select 'kie_usd_por_credito', '0.005', '2026-09-01' where not exists (select 1 from parametros where chave='kie_usd_por_credito')`);
  });

  async function rodarTudo() {
    await mods.coletarCambio(sim.cambioSimulado(), new Date("2026-09-25T15:00:00Z"));
    await mods.coletarCambio(sim.cambioSimulado(), agora);
    await mods.coletarMeta(sim.metaSimulado({ agora }), ["act_240727500555671", "act_210256430938513"], agora, 24 * 22);
    await mods.coletarOpenAI(sim.openaiSimulado(), "proj_cenas", agora, 3);
    await mods.importarVendasZenith(sim.vendasZenithExemplo(agora));
  }
  async function totais() {
    const [l] = await db.execute(sql`select count(*)::int as n, coalesce(sum(valor_brl),0)::float as soma from lancamentos`) as unknown as { n: number; soma: number }[];
    const [v] = await db.execute(sql`select count(*)::int as n, coalesce(sum(liquido_brl),0)::float as soma from vendas`) as unknown as { n: number; soma: number }[];
    const [c] = await db.execute(sql`select count(*)::int as n from campanhas`) as unknown as { n: number }[];
    return { lanc: l, vendas: v, camp: c.n };
  }

  it("rodar a coleta duas vezes não duplica nem muda totais", async () => {
    await rodarTudo();
    const a = await totais();
    await rodarTudo();
    const b = await totais();
    expect(b).toEqual(a);
    expect(a.lanc.n).toBeGreaterThan(0);
    expect(a.camp).toBe(4);
  });

  it("sanidade 02/10 via banco: Meta 315,29 → 358,89; OpenAI US$ 7,30; Zenith histórico 45 vendas = R$ 1.545,30; Meta 12/09–02/10 = 3.550,55", async () => {
    const brt = (s: string) => new Date(`${s}-03:00`);
    const r = await dados.calcularPeriodoComAnterior({ inicio: brt("2026-10-02T00:00"), fim: brt("2026-10-03T00:00") }, { tz: "America/Sao_Paulo", incluirHistorico: true, incluirManuais: true });
    expect(Math.abs(r.atual.totais.metaExibido - 315.29)).toBeLessThan(0.01);
    expect(Math.abs(r.atual.totais.metaComImposto - 358.89)).toBeLessThan(0.01);
    // OpenAI: bucket UTC de 02/10 cai parte em 01/10 BRT (21h–24h) e parte em 02/10 BRT; aqui as horas simuladas (10h e 15h UTC) caem em 02/10 BRT
    expect(Math.abs(r.atual.totais.iaOpenai - 7.30 * 5.40)).toBeLessThan(0.01);
    const h = await dados.calcularPeriodoComAnterior({ inicio: brt("2026-09-12T00:00"), fim: brt("2026-10-03T00:00") }, { tz: "America/Sao_Paulo", incluirHistorico: true, incluirManuais: true });
    expect(h.atual.totais.numVendas).toBe(45);
    expect(Math.abs(h.atual.totais.receitaLiquida - 1545.30)).toBeLessThan(0.01);
    expect(Math.abs(h.atual.totais.metaComImposto - 3550.55)).toBeLessThan(0.02);
  });

  it("kie.ai: queda de saldo vira uso (US$ 16,65 = 3330 créditos × 0,005); recarga entre leituras infere pacotes e o uso restante", async () => {
    await mods.coletarKie(sim.kieSimulado([10000]), new Date("2026-10-02T11:00:00Z"));
    await mods.coletarKie(sim.kieSimulado([6670]), new Date("2026-10-02T23:00:00Z"));
    await mods.coletarKie(sim.kieSimulado([9000]), new Date("2026-10-03T01:00:00Z")); // subiu 2330 → 3 pacotes de 1000 → 670 usados
    const brt = (s: string) => new Date(`${s}-03:00`);
    const r = await dados.calcularPeriodoComAnterior({ inicio: brt("2026-10-02T00:00"), fim: brt("2026-10-03T00:00") }, { tz: "America/Sao_Paulo", incluirHistorico: true, incluirManuais: true });
    expect(Math.abs(r.atual.totais.iaKie - (16.65 + 670 * 0.005) * 5.40)).toBeLessThan(0.01);
    const recargas = (await db.select().from(schema.lancamentos)).filter((l) => l.fonte === "kie" && l.tipo === "recarga_ia");
    expect(recargas).toHaveLength(1); expect(Number(recargas[0].valorOriginal)).toBe(3000);
  });

  it("3 falhas seguidas abrem aviso de coleta", async () => {
    const quebrado = { async saldoCreditos(): Promise<number> { throw new Error("timeout simulado"); } };
    for (let i = 0; i < 3; i++) await mods.coletarKie(quebrado);
    const avisos = await db.select().from(schema.avisos);
    expect(avisos.some((a) => a.tipo === "coleta_falhou" && a.fonte === "kie")).toBe(true);
  });

  it("DRE e cartões usam o mesmo cálculo: lucro líquido da DRE = lucro líquido dos totais", async () => {
    const brt = (s: string) => new Date(`${s}-03:00`);
    const r = await dados.calcularPeriodoComAnterior({ inicio: brt("2026-10-03T00:00"), fim: agora }, { tz: "America/Sao_Paulo", incluirHistorico: false, incluirManuais: true });
    const linha = r.atual.linhas.find((l) => l.chave === "lucro_liquido")!;
    expect(linha.valor).toBe(r.atual.totais.lucroLiquido);
    expect(r.atual.totais.numVendas).toBe(6); // vendas simuladas de hoje até 15h (6 aprovadas, 1 pendente; a das 15h24 ainda não)
    expect(r.atual.totais.pendentesQtd).toBe(1);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("kie.ai: recarga entre leituras (banco local)", () => {
  it("saldo 200 → 850 com pacote de 1000: recarga de 1 pacote e uso de 350 créditos (US$ 1,75), marcado estimado", async () => {
    const { db, schema } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const { coletarKie } = await import("@/coletores/kie");
    const { kieSimulado } = await import("@/coletores/simulados");
    await db.execute(sql`delete from lancamentos where fonte = 'kie'`);
    await db.execute(sql`insert into parametros (chave, valor, vigencia_inicio) select 'kie_pacote_creditos', '1000', '2026-09-01' where not exists (select 1 from parametros where chave = 'kie_pacote_creditos')`);
    await db.execute(sql`insert into cambio (dia, par, taxa, fonte) values ('2026-10-04','USDBRL','5.40','ptax') on conflict (dia, par) do update set taxa = '5.40'`);
    await coletarKie(kieSimulado([200]), new Date("2026-10-04T20:00:00Z"));
    await coletarKie(kieSimulado([850]), new Date("2026-10-04T20:10:00Z"));
    const usos = (await db.select().from(schema.lancamentos)).filter((l) => l.fonte === "kie" && l.tipo === "uso_ia");
    expect(usos).toHaveLength(1);
    expect(Number(usos[0].valorOriginal)).toBeCloseTo(1.75, 6); expect(usos[0].estimado).toBe(true);
    const recargas = (await db.select().from(schema.lancamentos)).filter((l) => l.fonte === "kie" && l.tipo === "recarga_ia");
    expect(recargas).toHaveLength(1); expect(Number(recargas[0].valorOriginal)).toBe(1000);
    // saldo 850 → 0 sem recarga: uso de 850 créditos = US$ 4,25, não estimado
    await coletarKie(kieSimulado([0]), new Date("2026-10-04T21:00:00Z"));
    const usos2 = (await db.select().from(schema.lancamentos)).filter((l) => l.fonte === "kie" && l.tipo === "uso_ia");
    expect(usos2).toHaveLength(2); expect(usos2.some((u) => Math.abs(Number(u.valorOriginal) - 4.25) < 1e-6 && !u.estimado)).toBe(true);
  });
});
