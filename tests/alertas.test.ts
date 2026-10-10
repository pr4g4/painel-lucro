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
  it("sem provedor configurado: guarda o estado, não envia, não conta envio nem repetindo 100 ciclos, e informa o que falta", async () => {
    await db.execute(sql`truncate alertas restart identity`);
    const cond = [{ chave: "agendador", tipo: "agendador_parado", ativa: true, mensagem: "Agendador parado" }];
    const r = await processar(t0, naoConfig, cond);
    expect(r.configurado).toBe(false); expect(r.faltando).toEqual(["CALLMEBOT_APIKEY"]); expect(r.enviados).toHaveLength(0);
    for (let i = 1; i <= 100; i++) await processar(new Date(t0.getTime() + i * 600_000), naoConfig, cond);
    const [a] = await db.select().from(schema.alertas);
    expect(a.envios).toBe(0); expect(a.ultimoEnvioEm).toBeNull(); expect(a.estado).toBe("aberto");
  });
  it("provedor falhando: tenta no máximo 1 vez a cada 3 h (não martela o CallMeBot) e não conta como envio", async () => {
    await db.execute(sql`truncate alertas restart identity`);
    let tentativas = 0;
    const quebrado: Provedor = { nome: "quebrado", configurado: () => true, faltando: () => [], async enviar() { tentativas++; throw new Error("CallMeBot HTTP 500"); } };
    const cond = [{ chave: "saldo:openai", tipo: "saldo_baixo", ativa: true, mensagem: "Saldo OpenAI baixo" }];
    for (let i = 0; i < 30; i++) await processar(new Date(t0.getTime() + i * 600_000), quebrado, cond); // 5 h em ciclos de 10 min
    expect(tentativas).toBe(2); // t0 e t0+3h
    const [a] = await db.select().from(schema.alertas); expect(a.envios).toBe(0); expect(a.ultimoErro).toMatch(/500/);
  });
});
