import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";

describe.skipIf(!process.env.DATABASE_URL)("reprocessamento de eventos da Zenith sem câmbio (banco local)", () => {
  let db: typeof import("../src/db").db; let schema: typeof import("../src/db").schema;
  let POST: typeof import("../src/app/api/zenith/webhook/route").POST;
  let assinar: typeof import("../src/coletores/zenith-webhook").assinar;
  let reprocessar: typeof import("../src/coletores/zenith-aplicar").reprocessarEventosZenith;
  let coletarCambio: typeof import("../src/coletores/cambio").coletarCambio;
  let cambioSimulado: typeof import("../src/coletores/simulados").cambioSimulado;
  const { NextRequest } = require("next/server") as typeof import("next/server");
  beforeAll(async () => {
    process.env.ZENITH_WEBHOOK_SECRET = "seg-rep";
    ({ db, schema } = await import("../src/db"));
    ({ POST } = await import("../src/app/api/zenith/webhook/route"));
    ({ assinar } = await import("../src/coletores/zenith-webhook"));
    ({ reprocessarEventosZenith: reprocessar } = await import("../src/coletores/zenith-aplicar"));
    ({ coletarCambio } = await import("../src/coletores/cambio"));
    ({ cambioSimulado } = await import("../src/coletores/simulados"));
    await db.execute(sql`truncate zenith_eventos, vendas, avisos, coletas, cambio restart identity`);
  });
  const enviar = async (id: string, data: Record<string, unknown>) => {
    const corpo = JSON.stringify({ id, type: "deposit.credited", data }); const ts = String(Date.now());
    const res = await POST(new NextRequest("http://localhost/api/zenith/webhook", { method: "POST", body: corpo, headers: { "x-zenith-event-id": id, "x-zenith-event-type": "deposit.credited", "x-zenith-timestamp": ts, "x-zenith-signature": assinar(ts, corpo, "seg-rep") } }));
    return res.json();
  };
  it("sem PTAX de MXN o webhook responde 200 com erro guardado; a coleta de câmbio (janela de 45 dias) grava taxas e reprocessa sozinha", async () => {
    const r = await enviar("ev-sem-cambio", { id: "cmuuifrz302ukuaj9e9k98slt", amount: 14900, currency: "MXN", creditedAt: "2026-10-04T07:59:00Z" });
    expect(r.resultado).toMatch(/^erro: .*sem câmbio/);
    expect((await db.select().from(schema.vendas)).length).toBe(0);
    const ev = (await db.select().from(schema.zenithEventos))[0];
    expect(ev.processado).toBe(false);
    // coleta num domingo (04/10) com tabela vazia → 45 dias → dias úteis anteriores entram
    const c = await coletarCambio(cambioSimulado(5.4, 0.30), new Date("2026-10-04T12:00:00Z"));
    expect(c.ok).toBe(true);
    expect((c.detalhe as { MXNBRL: { janelaDias: number } }).MXNBRL.janelaDias).toBe(45);
    expect((c.detalhe as { zenithReprocessados: { ok: number } }).zenithReprocessados.ok).toBe(1);
    const vs = await db.select().from(schema.vendas);
    expect(vs.length).toBe(1); expect(vs[0].idOrigem).toBe("cmuuifrz302ukuaj9e9k98slt"); expect(Number(vs[0].taxaCambio)).toBe(0.30);
    const ev2 = (await db.select().from(schema.zenithEventos))[0];
    expect(ev2.processado).toBe(true); expect(ev2.resultado).toMatch(/^reprocessado: venda .* criada/);
    // rodar de novo não duplica e não reprocessa nada
    const r2 = await reprocessar(); expect(r2.tentados).toBe(0);
    const c2 = await coletarCambio(cambioSimulado(5.4, 0.30), new Date("2026-10-04T12:30:00Z"));
    expect((c2.detalhe as { MXNBRL: { janelaDias: number } }).MXNBRL.janelaDias).toBe(15);
    expect((await db.select().from(schema.vendas)).length).toBe(1);
    // aviso de coleta_falhou da Zenith fecha
    const abertos = (await db.select().from(schema.avisos)).filter((a) => a.fonte === "zenith" && a.tipo === "coleta_falhou" && !a.resolvidoEm);
    expect(abertos.length).toBe(0);
  });
});
