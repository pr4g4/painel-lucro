import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { coletarIds } from "../src/coletores/zenith-webhook";

describe("ids aninhados", () => {
  it("coleta ids em qualquer nível, ignorando cliente/CLABE", () => {
    const ids = coletarIds({ id: "dep1", referenceId: "REF-1", payment: { id: "pay1", checkoutId: "chk1" }, customer: { id: "cust" }, clabe: "6461805...", amount: 14900 });
    expect(ids).toEqual(expect.arrayContaining(["dep1", "REF-1", "pay1", "chk1"]));
    expect(ids).not.toContain("cust");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("mesmo pagamento por eventos diferentes (banco local)", () => {
  let db: typeof import("../src/db").db; let schema: typeof import("../src/db").schema;
  let POST: typeof import("../src/app/api/zenith/webhook/route").POST;
  let assinar: typeof import("../src/coletores/zenith-webhook").assinar;
  let varrer: typeof import("../src/coletores/zenith").varrerDuplicadas;
  let importar: typeof import("../src/coletores/zenith").importarVendasZenith;
  let lerCsv: typeof import("../src/coletores/zenith").lerCsvConciliacaoZenith;
  const { NextRequest } = require("next/server") as typeof import("next/server");
  const SEG = "seg-dedup";
  const enviar = async (id: string, type: string, data: Record<string, unknown>) => {
    const corpo = JSON.stringify({ id, type, data }); const ts = String(Date.now());
    const res = await POST(new NextRequest("http://localhost/api/zenith/webhook", { method: "POST", body: corpo, headers: { "x-zenith-event-id": id, "x-zenith-event-type": type, "x-zenith-timestamp": ts, "x-zenith-signature": assinar(ts, corpo, SEG) } }));
    return res.json();
  };
  const vendasAtivas = async () => (await db.select().from(schema.vendas)).filter((v) => v.status === "aprovada" || v.status === "pendente");
  beforeAll(async () => {
    process.env.ZENITH_WEBHOOK_SECRET = SEG;
    ({ db, schema } = await import("../src/db"));
    ({ POST } = await import("../src/app/api/zenith/webhook/route"));
    ({ assinar } = await import("../src/coletores/zenith-webhook"));
    ({ varrerDuplicadas: varrer, importarVendasZenith: importar, lerCsvConciliacaoZenith: lerCsv } = await import("../src/coletores/zenith"));
    await db.execute(sql`truncate zenith_eventos, vendas, avisos, coletas, cambio restart identity`);
    await db.execute(sql`insert into cambio (dia, par, taxa, fonte) values ('2026-10-02','MXNBRL','0.30','ptax_usd_x_ecb')`);
  });

  it("deposit.credited (id X) + payment.captured (id Y, sem id em comum) do mesmo valor em 2 min → UMA venda; venda igual 30 min depois → outra", async () => {
    const a = await enviar("e1", "deposit.credited", { id: "cmuuefdgb01xm10ptm5sd0yey", amount: 14900, currency: "MXN", paymentMethod: "spei", creditedAt: "2026-10-04T22:43:10Z" });
    expect(a.resultado).toMatch(/criada/);
    const b = await enviar("e2", "payment.captured", { id: "cmuuefdzf01xs10pt25oagkot", amount: 14900, currency: "MXN", paymentMethod: "SPEI · CLABE fixa", capturedAt: "2026-10-04T22:43:43Z" });
    expect(b.resultado).toMatch(/já registrada.*família diferente/);
    expect((await vendasAtivas()).length).toBe(1);
    // os ids ficaram mesclados: um checkout.succeeded com o id do pagamento liga direto
    const c = await enviar("e3", "checkout.succeeded", { id: "cmuuefdzf01xs10pt25oagkot", amount: 14900, currency: "MXN" });
    expect(c.resultado).toMatch(/já registrada/); expect(c.resultado).not.toMatch(/família diferente/);
    // venda de mesmo valor 30 min depois é outra venda
    const d = await enviar("e4", "deposit.credited", { id: "dep-outra", amount: 14900, currency: "MXN", creditedAt: "2026-10-04T23:15:00Z" });
    expect(d.resultado).toMatch(/criada/);
    expect((await vendasAtivas()).length).toBe(2);
    // dois depósitos (mesma família) de mesmo valor em 2 min continuam sendo duas vendas (clientes diferentes)
    const e = await enviar("e5", "deposit.credited", { id: "dep-outra-2", amount: 14900, currency: "MXN", creditedAt: "2026-10-04T23:16:00Z" });
    expect(e.resultado).toMatch(/criada/);
    expect((await vendasAtivas()).length).toBe(3);
  });

  it("id aninhado (payment.id) liga depósito ao pagamento mesmo fora da janela", async () => {
    await enviar("e6", "payment.captured", { id: "pay-9", amount: 9900, currency: "MXN", capturedAt: "2026-10-04T10:00:00Z" });
    const r = await enviar("e7", "deposit.credited", { id: "dep-9", payment: { id: "pay-9" }, amount: 9900, currency: "MXN", creditedAt: "2026-10-04T12:00:00Z" });
    expect(r.resultado).toMatch(/já registrada como pay-9/);
  });

  it("varredura: duplicada já gravada (depósito do webhook × venda do CSV) é listada e, ao aplicar, anulada sem apagar", async () => {
    await db.execute(sql`truncate vendas restart identity`);
    const csv = `"id_venda";"referencia";"data_hora_brt";"pais";"metodo_pagamento";"status";"moeda";"valor_bruto";"taxa_aplicada";"retencao";"deducoes_totais";"valor_liquido";"status_financeiro"\n"cmuuefdzf01xs10pt25oagkot";"";"04/10/2026, 19:43:43";"MX";"SPEI · CLABE fixa";"CAPTURED";"MXN";"149,00";"7,99%";"14,90";"34,78";"114,22";"CONFIRMADO"\n`;
    expect((await importar(lerCsv(csv))).ok).toBe(true);
    // simula a venda duplicada antiga (criada pelo webhook antes da regra existir): insere direto, família depósito
    await db.insert(schema.vendas).values({ fonte: "zenith", idOrigem: "cmuuefdgb01xm10ptm5sd0yey", status: "aprovada", criadaEm: new Date("2026-10-04T22:43:10Z"), aprovadaEm: new Date("2026-10-04T22:43:10Z"), moeda: "MXN", brutoOriginal: "149", taxaCambio: "0.3", brutoBrl: "44.7", liquidoBrl: "38.73", reservaBrl: "4.47", historico: false, payload: { familia: "deposito", ids: ["cmuuefdgb01xm10ptm5sd0yey"] } });
    const lista = await varrer(new Date("2026-10-03T03:00:00Z"), false);
    expect(lista.pares).toHaveLength(1);
    expect(lista.pares[0]).toMatchObject({ mantida: "cmuuefdzf01xs10pt25oagkot", anulada: "cmuuefdgb01xm10ptm5sd0yey" });
    expect((await vendasAtivas()).length).toBe(2); // só listou
    await varrer(new Date("2026-10-03T03:00:00Z"), true);
    const todas = await db.select().from(schema.vendas);
    expect(todas.length).toBe(2); // nada apagado
    const anulada = todas.find((v) => v.idOrigem === "cmuuefdgb01xm10ptm5sd0yey")!;
    expect(anulada.status).toBe("cancelada"); expect(anulada.observacao).toMatch(/duplicada de cmuuefdzf01xs10pt25oagkot/);
    expect((await vendasAtivas()).length).toBe(1);
    const mantida = todas.find((v) => v.idOrigem === "cmuuefdzf01xs10pt25oagkot")!;
    expect((mantida.payload as { ids: string[] }).ids).toContain("cmuuefdgb01xm10ptm5sd0yey");
    // o mesmo depósito reenviado pelo webhook agora liga direto pelo id mesclado
    const r = await enviar("e8", "deposit.credited", { id: "cmuuefdgb01xm10ptm5sd0yey", amount: 14900, currency: "MXN", creditedAt: "2026-10-04T22:43:10Z" });
    expect(r.resultado).toMatch(/já registrada/);
    expect((await vendasAtivas()).length).toBe(1);
  });
});
