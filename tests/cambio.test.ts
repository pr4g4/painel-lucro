import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";

describe.skipIf(!process.env.DATABASE_URL)("câmbio MXN cruzado (banco local)", () => {
  let db: typeof import("../src/db").db; let schema: typeof import("../src/db").schema;
  let coletarCambio: typeof import("../src/coletores/cambio").coletarCambio;
  beforeAll(async () => {
    ({ db, schema } = await import("../src/db"));
    ({ coletarCambio } = await import("../src/coletores/cambio"));
    await db.execute(sql`truncate cambio, coletas, avisos, zenith_eventos restart identity`);
  });
  it("MXNBRL = PTAX USDBRL × MXN→USD do ECB, fonte ptax_usd_x_ecb; sem PTAX nenhuma usa ECB direto", async () => {
    const semPtax = { async ptaxUsd() { return []; }, async ecbMxn(de: string, ate: string) { return [{ dia: "2026-10-02", mxnUsd: 0.05454, mxnBrl: 0.28478 }].filter((x) => x.dia >= de && x.dia <= ate); } };
    const r1 = await coletarCambio(semPtax, new Date("2026-10-04T12:00:00Z"));
    expect(r1.ok).toBe(true);
    let [mxn] = await db.select().from(schema.cambio).where(sql`par = 'MXNBRL'`);
    expect(mxn.fonte).toBe("ecb_direto"); expect(Number(mxn.taxa)).toBeCloseTo(0.28478, 6);
    const comPtax = { async ptaxUsd() { return [{ dia: "2026-10-02", taxa: 5.2225 }]; }, ...{ ecbMxn: semPtax.ecbMxn } };
    const r2 = await coletarCambio(comPtax, new Date("2026-10-04T12:00:00Z"));
    expect(r2.ok).toBe(true);
    [mxn] = await db.select().from(schema.cambio).where(sql`par = 'MXNBRL'`);
    expect(mxn.fonte).toBe("ptax_usd_x_ecb"); expect(Number(mxn.taxa)).toBeCloseTo(5.2225 * 0.05454, 6);
    expect((r2.detalhe as { MXNBRL: { cruzadas: number } }).MXNBRL.cruzadas).toBe(1);
    // hoje (domingo) fica provisório para USD; leitura "última até a data" cobre sábado/domingo
    const { taxaDoDia } = await import("../src/coletores/base");
    expect((await taxaDoDia("MXNBRL", "2026-10-04"))?.taxa).toBeCloseTo(5.2225 * 0.05454, 6);
  });
});
