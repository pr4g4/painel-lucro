import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { assinar, verificarAssinatura, interpretarEvento, lerCabecalhos } from "../src/coletores/zenith-webhook";

const SEG = "segredo-de-teste-apenas-local";
const agora = 1_790_000_000_000; // ms

function cab(ts: string | number, corpo: string, extra: Partial<Record<string, string | null>> = {}) {
  const base: Record<string, string | null> = { "x-zenith-event-id": "evt_1", "x-zenith-event-type": "payment.captured", "x-zenith-timestamp": String(ts), "x-zenith-signature": assinar(String(ts), corpo, SEG), ...extra };
  return lerCabecalhos((n) => base[n] ?? null);
}

describe("assinatura do webhook da Zenith", () => {
  const corpo = JSON.stringify({ id: "evt_1", type: "payment.captured", data: { referenceId: "ref1", amount: 14900, currency: "MXN" } });
  it("aceita assinatura válida (timestamp em segundos ou ms) e rejeita header faltando, janela > 300 s e assinatura errada", () => {
    expect(verificarAssinatura(cab(Math.floor(agora / 1000), corpo), corpo, SEG, agora)).toBeNull();
    expect(verificarAssinatura(cab(agora, corpo), corpo, SEG, agora)).toBeNull();
    expect(verificarAssinatura(cab(agora, corpo, { "x-zenith-signature": null }), corpo, SEG, agora)).toMatch(/ausente/);
    expect(verificarAssinatura(cab(agora - 301_000, corpo), corpo, SEG, agora)).toMatch(/300/);
    expect(verificarAssinatura(cab(agora, corpo), corpo + " ", SEG, agora)).toMatch(/inválida/); // corpo alterado
    expect(verificarAssinatura(cab(agora, corpo), corpo, "outro-segredo", agora)).toMatch(/inválida/);
    expect(verificarAssinatura(cab(agora, corpo, { "x-zenith-signature": "zz" }), corpo, SEG, agora)).toMatch(/inválida/);
  });
});

describe("interpretação dos eventos", () => {
  it("deposit.credited vira venda aprovada com bruto em unidades; referenceId é a identidade", () => {
    const r = interpretarEvento({ id: "evt", type: "deposit.credited", data: { referenceId: "ref9", amount: 14900, currency: "MXN", creditedAt: "2026-10-04T15:00:00Z" } }, null, null, "evt");
    if (!r.ok) throw new Error(r.motivo);
    expect(r.identidade).toBe("ref9");
    expect(r.venda).toMatchObject({ id: "ref9", status: "aprovada", bruto: 149, moeda: "MXN" });
    expect(r.venda.aprovadaEm).toEqual(new Date("2026-10-04T15:00:00Z"));
  });
  it("sem referenceId usa data.id; sem nada usa o id do evento; pending/refund/chargeback mapeiam status", () => {
    const a = interpretarEvento({ type: "deposit.credited", data: { id: "dep1", amount: 9900 } }, null, "1790000000", "evt2");
    expect(a.ok && a.identidade).toBe("dep1");
    const b = interpretarEvento({ type: "payment.pending", data: { amount: 9900 } }, null, "1790000000", "evt3");
    expect(b.ok && b.venda.status).toBe("pendente"); expect(b.ok && b.venda.aprovadaEm).toBeNull(); expect(b.ok && b.identidade).toBe("evt3");
    const c = interpretarEvento({ type: "payment.refunded", data: { referenceId: "ref9", refundedAt: "2026-10-05T10:00:00Z" } }, null, null, "evt4");
    expect(c.ok && c.venda.status).toBe("reembolsada"); expect(c.ok && c.venda.reembolsadaEm).toEqual(new Date("2026-10-05T10:00:00Z"));
    const d = interpretarEvento({ type: "payment.chargeback", data: { referenceId: "ref9" } }, null, "1790000000", "evt5");
    expect(d.ok && d.venda.status).toBe("chargeback");
  });
  it("tipo não tratado é ignorado; amount ausente marca formato desconhecido", () => {
    const x = interpretarEvento({ type: "payout.sent", data: {} }, null, null, "e");
    expect(x.ok).toBe(false); expect(!x.ok && x.desconhecido).toBe(false);
    const y = interpretarEvento({ type: "payment.captured", data: { referenceId: "r" } }, null, null, "e");
    expect(!y.ok && y.desconhecido).toBe(true);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("rota do webhook (banco local)", () => {
  let POST: typeof import("../src/app/api/zenith/webhook/route").POST;
  let db: typeof import("../src/db").db; let schema: typeof import("../src/db").schema;
  const { NextRequest } = require("next/server") as typeof import("next/server");
  beforeAll(async () => {
    process.env.ZENITH_WEBHOOK_SECRET = SEG;
    ({ POST } = await import("../src/app/api/zenith/webhook/route"));
    ({ db, schema } = await import("../src/db"));
    await db.execute(sql`truncate zenith_eventos, vendas, avisos, coletas restart identity`);
    await db.execute(sql`insert into cambio (dia, par, taxa, fonte) values ('2026-10-04','MXNBRL','0.30','manual') on conflict (dia, par) do update set taxa = '0.30'`);
  });
  async function enviar(eventId: string, type: string, data: Record<string, unknown>, opts: { ts?: number; assinatura?: string } = {}) {
    const corpo = JSON.stringify({ id: eventId, type, data });
    const ts = opts.ts ?? Date.now();
    const req = new NextRequest("http://localhost/api/zenith/webhook", { method: "POST", body: corpo, headers: {
      "content-type": "application/json", "x-zenith-event-id": eventId, "x-zenith-event-type": type, "x-zenith-timestamp": String(ts), "x-zenith-signature": opts.assinatura ?? assinar(String(ts), corpo, SEG),
    } });
    const res = await POST(req);
    return { status: res.status, json: await res.json() };
  }
  const soma = async () => (await db.execute(sql`select count(*)::int as n, coalesce(sum(liquido_brl) filter (where status='aprovada'),0)::float as liq, coalesce(sum(reserva_brl),0)::float as res from vendas`) as unknown as { n: number; liq: number; res: number }[])[0];

  it("401 sem assinatura válida ou fora da janela; nada é gravado", async () => {
    expect((await enviar("e0", "payment.captured", { referenceId: "r0", amount: 14900 }, { assinatura: "00" })).status).toBe(401);
    expect((await enviar("e0", "payment.captured", { referenceId: "r0", amount: 14900 }, { ts: Date.now() - 400_000 })).status).toBe(401);
    expect((await soma()).n).toBe(0);
  });

  it("deposit.credited cria a venda com líquido = bruto − 7,99% − 5 − 2% e reserva 10% do bruto (MX$149 → listado 114,22)", async () => {
    const r = await enviar("e1", "deposit.credited", { referenceId: "ref149", amount: 14900, currency: "MXN", paymentMethod: "spei", creditedAt: "2026-10-04T15:00:00Z" });
    expect(r.status).toBe(200); expect(r.json.resultado).toMatch(/criada: aprovada/);
    const [v] = await db.select().from(schema.vendas);
    const liq = Number(v.liquidoBrl) / 0.30, res = Number(v.reservaBrl) / 0.30;
    expect(Math.abs(liq - 129.11)).toBeLessThan(0.01);
    expect(Math.abs(res - 14.90)).toBeLessThan(0.01);
    expect(Math.abs(liq - res - 114.22)).toBeLessThan(0.02);
    expect(v.aprovadaEm?.toISOString()).toBe("2026-10-04T15:00:00.000Z");
  });

  it("mesmo X-Zenith-Event-Id reenviado → 200 duplicado, sem mudar nada", async () => {
    const antes = await soma();
    const r = await enviar("e1", "deposit.credited", { referenceId: "ref149", amount: 14900, currency: "MXN" });
    expect(r.json.duplicado).toBe(true);
    expect(await soma()).toEqual(antes);
    expect((await db.select().from(schema.zenithEventos)).length).toBe(1);
  });

  it("payment.captured e checkout.succeeded da mesma venda (mesmo referenceId) não somam de novo", async () => {
    const antes = await soma();
    const a = await enviar("e2", "payment.captured", { referenceId: "ref149", amount: 14900, currency: "MXN", capturedAt: "2026-10-04T15:00:05Z" });
    const b = await enviar("e3", "checkout.succeeded", { referenceId: "ref149", amount: 14900, currency: "MXN" });
    expect(a.json.resultado).toMatch(/não somou de novo/); expect(b.json.resultado).toMatch(/não somou de novo/);
    const depois = await soma();
    expect(depois.n).toBe(antes.n); expect(depois.liq).toBeCloseTo(antes.liq, 6);
    const [v] = await db.select().from(schema.vendas);
    expect(v.aprovadaEm?.toISOString()).toBe("2026-10-04T15:00:00.000Z"); // primeira aprovação fica
    expect((await db.select().from(schema.zenithEventos)).length).toBe(3); // todos os eventos guardados
  });

  it("payment.pending fica fora da receita; depois payment.captured aprova na hora da captura", async () => {
    await enviar("e4", "payment.pending", { referenceId: "ref99", amount: 9900, currency: "MXN", createdAt: "2026-10-04T16:00:00Z" });
    let s = await soma(); expect(s.n).toBe(2);
    const pend = (await db.select().from(schema.vendas)).find((v) => v.idOrigem === "ref99")!;
    expect(pend.status).toBe("pendente"); expect(pend.aprovadaEm).toBeNull(); expect(Number(pend.reservaBrl)).toBe(0);
    await enviar("e5", "payment.captured", { referenceId: "ref99", amount: 9900, currency: "MXN", capturedAt: "2026-10-04T16:30:00Z" });
    const apr = (await db.select().from(schema.vendas)).find((v) => v.idOrigem === "ref99")!;
    expect(apr.status).toBe("aprovada"); expect(apr.aprovadaEm?.toISOString()).toBe("2026-10-04T16:30:00.000Z");
    s = await soma(); expect(Math.abs(s.liq / 0.30 - (129.11 + 84.11))).toBeLessThan(0.02);
  });

  it("payment.refunded marca a venda e grava a data do reembolso; receita original fica na data da venda", async () => {
    await enviar("e6", "payment.refunded", { referenceId: "ref99", refundedAt: "2026-10-05T10:00:00Z" });
    const v = (await db.select().from(schema.vendas)).find((x) => x.idOrigem === "ref99")!;
    expect(v.status).toBe("reembolsada"); expect(v.reembolsadaEm?.toISOString()).toBe("2026-10-05T10:00:00.000Z"); expect(v.aprovadaEm?.toISOString()).toBe("2026-10-04T16:30:00.000Z");
  });

  it("reembolso de venda desconhecida vira histórico + aviso; depósito avulso sem referenceId conta uma vez", async () => {
    await enviar("e7", "payment.chargeback", { referenceId: "nunca-vi" });
    const v = (await db.select().from(schema.vendas)).find((x) => x.idOrigem === "nunca-vi")!;
    expect(v.historico).toBe(true);
    await enviar("e8", "deposit.credited", { id: "dep77", amount: 19900, currency: "MXN", paymentMethod: "spei" });
    await enviar("e9", "deposit.credited", { id: "dep77", amount: 19900, currency: "MXN", paymentMethod: "spei" });
    expect((await db.select().from(schema.vendas)).filter((x) => x.idOrigem === "dep77").length).toBe(1);
    const avisos = await db.select().from(schema.avisos);
    expect(avisos.some((a) => a.tipo === "reembolso_sem_venda")).toBe(true);
  });

  it("formato desconhecido: grava o evento, abre aviso, responde 200", async () => {
    const r = await enviar("e10", "payment.captured", { foo: "bar" });
    expect(r.status).toBe(200); expect(r.json.resultado).toMatch(/ignorado/);
    const ev = (await db.select().from(schema.zenithEventos)).find((x) => x.eventoId === "e10")!;
    expect(ev.payload).toMatchObject({ data: { foo: "bar" } });
    expect((await db.select().from(schema.avisos)).some((a) => a.tipo === "formato_desconhecido")).toBe(true);
    const outro = await enviar("e11", "payout.sent", { amount: 1 });
    expect(outro.json.resultado).toMatch(/tipo não tratado/);
  });
});
