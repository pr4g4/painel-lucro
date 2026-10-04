import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";

describe.skipIf(!process.env.DATABASE_URL)("executor do banco (banco local)", () => {
  it("consulta que passa do prazo recicla o cliente, repete uma vez e, se estourar de novo, lança erro (nunca fica pendurada)", async () => {
    const { executar } = await import("../src/db");
    const t0 = Date.now();
    await expect(executar((d) => d.execute(sql`select pg_sleep(3)`), 500, "lenta")).rejects.toThrow(/tempo esgotado/);
    expect(Date.now() - t0).toBeLessThan(3000); // 2 tentativas × 0,5 s + reciclagem
    // o cliente novo funciona normalmente depois
    const r = await executar((d) => d.execute(sql`select 1 as um`), 5000, "rápida") as unknown as { um: number }[];
    expect(r[0].um).toBe(1);
  }, 20000);
});
