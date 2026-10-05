import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import type { Provedor } from "../src/alertas/provedores";

describe.skipIf(!process.env.DATABASE_URL)("alertas WhatsApp (banco local)", () => {
  let db: typeof import("../src/db").db; let schema: typeof import("../src/db").schema;
  let processar: typeof import("../src/alertas/motor").processarAlertas;
  const enviados: string[] = [];
  const fake: Provedor = { nome: "fake", configurado: () => true, faltando: () => [], async enviar(t) { enviados.push(t); } };
  const naoConfig: Provedor = { nome: "nenhum", configurado: () => false, faltando: () => ["CALLMEBOT_APIKEY"], async enviar() { throw new Error("não deveria enviar"); } };
  const cond = (ativa: boolean, msg = "Saldo kie.ai: acaba em ~2.0 h") => [{ chave: "saldo:kie", tipo: "saldo_baixo", ativa, mensagem: msg }];
  const t0 = new Date("2026-10-05T10:00:00Z");
  beforeAll(async () => {
    ({ db, schema } = await import("../src/db"));
    ({ processarAlertas: processar } = await import("../src/alertas/motor"));
    await db.execute(sql`truncate alertas restart identity`);
    await db.execute(sql`insert into parametros (chave, valor, vigencia_inicio) select 'alerta_repeticao_h', '3', '2026-09-01' where not exists (select 1 from parametros where chave = 'alerta_repeticao_h')`);
  });
  it("abre → envia 1 vez; repete só após 3 h; ao resolver envia 'resolvido'; reabrir envia de novo", async () => {
    await processar(t0, fake, cond(true));
    expect(enviados).toHaveLength(1); expect(enviados[0]).toMatch(/kie\.ai/);
    await processar(new Date(t0.getTime() + 60 * 60_000), fake, cond(true)); // 1 h depois: nada
    expect(enviados).toHaveLength(1);
    await processar(new Date(t0.getTime() + 3.5 * 3_600_000), fake, cond(true)); // 3,5 h: repete
    expect(enviados).toHaveLength(2); expect(enviados[1]).toMatch(/ainda/);
    await processar(new Date(t0.getTime() + 4 * 3_600_000), fake, cond(false, "Saldo kie.ai: ok")); // resolvido
    expect(enviados).toHaveLength(3); expect(enviados[2]).toMatch(/Resolvido/);
    const [a] = await db.select().from(schema.alertas); expect(a.estado).toBe("resolvido"); expect(a.envios).toBe(3);
    await processar(new Date(t0.getTime() + 5 * 3_600_000), fake, cond(false)); // continua resolvido: nada
    expect(enviados).toHaveLength(3);
    await processar(new Date(t0.getTime() + 6 * 3_600_000), fake, cond(true)); // reabre
    expect(enviados).toHaveLength(4);
  });
  it("sem provedor configurado: guarda o estado, não envia, e informa o que falta", async () => {
    await db.execute(sql`truncate alertas restart identity`);
    const r = await processar(t0, naoConfig, [{ chave: "agendador", tipo: "agendador_parado", ativa: true, mensagem: "Agendador parado" }]);
    expect(r.configurado).toBe(false); expect(r.faltando).toEqual(["CALLMEBOT_APIKEY"]); expect(r.enviados).toHaveLength(0);
    expect((await db.select().from(schema.alertas)).length).toBe(1);
  });
});
