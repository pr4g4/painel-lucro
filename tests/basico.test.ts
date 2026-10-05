import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
describe.skipIf(!process.env.DATABASE_URL)("cadastros básicos automáticos (banco local)", () => {
  it("cria parâmetros que faltam sem mexer nos existentes; segunda rodada não faz nada", async () => {
    const { db, schema } = await import("../src/db");
    const { garantirBasico } = await import("../src/coletores/basico");
    await db.execute(sql`delete from parametros where chave in ('pendente_expira_oxxo_h', 'alerta_saldo_usd')`);
    await db.execute(sql`update parametros set valor = '0.005' where chave = 'kie_usd_por_credito'`);
    const feito = await garantirBasico();
    expect(feito.some((f) => f.includes("pendente_expira_oxxo_h = 72"))).toBe(true);
    expect(feito.some((f) => f.includes("alerta_saldo_usd = 3"))).toBe(true);
    const [kie] = await db.select().from(schema.parametros).where(sql`chave = 'kie_usd_por_credito'`);
    expect(kie.valor).toBe("0.005"); // existente não é sobrescrito
    expect(await garantirBasico()).toEqual([]);
  });
});
