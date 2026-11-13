import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";

/** Pedido 4 (13/11): o resumo da inicial é calculado na coleta e gravado; a leitura devolve os mesmos números do cálculo direto. */
describe.skipIf(!process.env.DATABASE_URL)("resumos prontos (banco local)", () => {
  let res: typeof import("../src/lib/resumos"); let db: typeof import("../src/db").db; let schema: typeof import("../src/db").schema;
  beforeAll(async () => {
    ({ db, schema } = await import("../src/db"));
    await (await import("../src/db/esquema")).verificarEsquema(true); // cria a tabela resumos (0006) sozinho
    res = await import("../src/lib/resumos");
  });
  it("recalcularResumos grava 7 períodos + vivo; a linha bate com o cálculo direto; a inicial lê pronto e não recalcula", async () => {
    const agora = new Date();
    const r = await res.recalcularResumos(agora);
    expect(r.gravados).toBe(8);
    const linhas = await db.select().from(schema.resumos);
    expect(linhas.map((l) => l.chave).sort()).toEqual(["inicial:7_dias", "inicial:hoje", "inicial:marco_zero", "inicial:mes_atual", "inicial:ontem", "inicial:ultimas_24h", "inicial:ultimas_6h", "vivo:hoje"]);
    const marco = linhas.find((l) => l.chave === "inicial:marco_zero")!.dados as import("../src/lib/resumos").ResumoInicial;
    // cálculo direto do mesmo período, com a mesma entrada
    const { lerPeriodo } = await import("../src/lib/periodo-url");
    const { calcularDRE, resolverAtalho } = await import("../src/lib/calculo");
    const estado = lerPeriodo({ p: "marco_zero" }, new Date(marco.marcoZero), agora);
    const e = await res.entradaDireta({ inicio: new Date("2026-09-01T03:00:00Z"), fim: agora });
    const direto = calcularDRE({ ...e, periodo: estado.periodo, opcoes: { ...e.opcoes, tz: estado.tz, incluirHistorico: false, incluirManuais: true } }).totais;
    expect(marco.totais.lucroLiquido).toBeCloseTo(direto.lucroLiquido, 6);
    expect(marco.totais.numVendas).toBe(direto.numVendas);
    expect(marco.hoje.numVendas).toBe(calcularDRE({ ...e, periodo: resolverAtalho("hoje", agora, new Date(marco.marcoZero), estado.tz).periodo }).totais.numVendas);
    expect(marco.acum.pontos.length).toBeGreaterThan(0);
    expect(marco.funil.aprovadas).toBe(marco.totais.numVendas);
    // vivo: linha minúscula
    const vivo = await res.lerVivo();
    expect(vivo).toMatchObject({ vendas: (linhas.find((l) => l.chave === "inicial:hoje")!.dados as { totais: { numVendas: number } }).totais.numVendas });
    expect(JSON.stringify(vivo).length).toBeLessThan(200);
    // tamanho de uma linha pronta: pequena
    expect(JSON.stringify(marco).length).toBeLessThan(20_000);
    // pedido pronto × ao vivo
    expect(res.ehPedidoPronto({})).toBe("marco_zero");
    expect(res.ehPedidoPronto({ p: "hoje" })).toBe("hoje");
    expect(res.ehPedidoPronto({ p: "hoje", tz: "America/Mexico_City" })).toBeNull();
    expect(res.ehPedidoPronto({ de: "2026-10-05T00:00", ate: "2026-10-06T00:00" })).toBeNull();
    expect(res.ehPedidoPronto({ p: "tudo" })).toBeNull();
  });
  it("tabela vazia → recalcula uma vez", async () => {
    await db.execute(sql`truncate resumos`);
    expect(await res.lerVivo()).toBeNull();
    await res.recalcularResumos();
    expect(await res.lerVivo()).not.toBeNull();
  });
});
