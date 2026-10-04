import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { lerCsvConciliacaoZenith, lerCsvZenithAuto, dataBrt, dividirCsv } from "../src/coletores/zenith";

const CSV = `"id_venda";"referencia";"data_hora_brt";"pais";"metodo_pagamento";"status";"moeda";"valor_bruto";"taxa_aplicada";"retencao";"deducoes_totais";"valor_liquido";"status_financeiro"
"cmusiwfnh0c92mn0d606yyx09";"REF-1";"03/10/2026, 14:05:10";"MX";"SPEI · CLABE fixa";"CAPTURED";"MXN";"149,00";"7,99%";"14,90";"34,78";"114,22";"CONFIRMADO"
"cmv0000000000000000000002";"REF-2";"04/10/2026, 09:30:00";"MX";"OXXO";"PENDING";"MXN";"99,00";"";"0,00";"0,00";"0,00";"NAO_CONFIRMADO"
"cmv0000000000000000000003";"REF-3";"01/10/2026, 03:37:25";"MX";"OXXO";"CAPTURED";"MXN";"1.199,00";"7,99%";"119,90";"";"954,22";"CONFIRMADO"
`;

describe("CSV nativo da Zenith (Conciliação)", () => {
  it("lê aspas, ;, decimal com vírgula e data de Brasília; CAPTURED aprova, PENDING fica pendente; retencao = reserva", () => {
    const v = lerCsvConciliacaoZenith(CSV);
    expect(v).toHaveLength(3);
    expect(v[0]).toMatchObject({ id: "cmusiwfnh0c92mn0d606yyx09", status: "aprovada", moeda: "MXN", bruto: 149, liquido: 114.22, reserva: 14.9, ids: ["REF-1"] });
    expect(v[0].aprovadaEm).toEqual(new Date("2026-10-03T17:05:10.000Z")); // 14:05 BRT
    expect(v[1]).toMatchObject({ status: "pendente", aprovadaEm: null, bruto: 99 });
    expect(v[2].bruto).toBe(1199); // "1.199,00"
    expect((v[0].payload as { metodo_pagamento: string }).metodo_pagamento).toBe("SPEI · CLABE fixa");
    expect(dataBrt("01/10/2026, 03:37:25")).toEqual(new Date("2026-10-01T06:37:25.000Z"));
    expect(dividirCsv('"a;b";"c""d"\n"1";"2"')).toEqual([["a;b", 'c"d'], ["1", "2"]]);
    expect(lerCsvZenithAuto(CSV)).toHaveLength(3);
    expect(lerCsvZenithAuto("id,status,data,bruto\nX1,aprovada,2026-10-03 10:00,149")).toHaveLength(1);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("importação do CSV + dedup com webhook (banco local)", () => {
  let db: typeof import("../src/db").db; let schema: typeof import("../src/db").schema;
  let importar: typeof import("../src/coletores/zenith").importarVendasZenith;
  beforeAll(async () => {
    ({ db, schema } = await import("../src/db"));
    ({ importarVendasZenith: importar } = await import("../src/coletores/zenith"));
    await db.execute(sql`truncate zenith_eventos, vendas, avisos, coletas, cambio restart identity`);
  });
  it("sem nenhuma PTAX gravada: tudo-ou-nada com contagem de linhas", async () => {
    const r = await importar(lerCsvConciliacaoZenith(CSV));
    expect(r.ok).toBe(false); expect(r.erro).toMatch(/3 de 3 linha\(s\)/); expect(r.erro).toMatch(/sem câmbio/);
    expect((await db.select().from(schema.vendas)).length).toBe(0);
  });
  it("fim de semana usa a última PTAX até a data (sexta 02/10); líquido listado + reserva = líquido antes da reserva", async () => {
    await db.execute(sql`insert into cambio (dia, par, taxa, fonte) values ('2026-10-02','MXNBRL','0.30','ptax'), ('2026-10-01','MXNBRL','0.29','ptax')`);
    const r = await importar(lerCsvConciliacaoZenith(CSV));
    expect(r.ok).toBe(true); expect(r.registros).toBe(3);
    const vs = await db.select().from(schema.vendas);
    const v1 = vs.find((x) => x.idOrigem === "cmusiwfnh0c92mn0d606yyx09")!;
    expect(Number(v1.taxaCambio)).toBe(0.30); // sábado 03/10 → sexta 02/10
    expect(Math.abs(Number(v1.liquidoBrl) - (114.22 + 14.9) * 0.30)).toBeLessThan(1e-6);
    expect(Math.abs(Number(v1.reservaBrl) - 14.9 * 0.30)).toBeLessThan(1e-6);
    expect(v1.historico).toBe(false);
    const v3 = vs.find((x) => x.idOrigem === "cmv0000000000000000000003")!;
    expect(Number(v3.taxaCambio)).toBe(0.29); expect(v3.historico).toBe(true); // 01/10 < marco zero
    // importar de novo não duplica
    await importar(lerCsvConciliacaoZenith(CSV));
    expect((await db.select().from(schema.vendas)).length).toBe(3);
  });
  it("webhook depois do CSV: mesmo id_venda (data.id) ou mesma referência não cria segunda venda", async () => {
    process.env.ZENITH_WEBHOOK_SECRET = "seg-teste";
    const { POST } = await import("../src/app/api/zenith/webhook/route");
    const { assinar } = await import("../src/coletores/zenith-webhook");
    const { NextRequest } = await import("next/server");
    const enviar = async (eventId: string, data: Record<string, unknown>) => {
      const corpo = JSON.stringify({ id: eventId, type: "payment.captured", data }); const ts = String(Date.now());
      const res = await POST(new NextRequest("http://localhost/api/zenith/webhook", { method: "POST", body: corpo, headers: { "x-zenith-event-id": eventId, "x-zenith-event-type": "payment.captured", "x-zenith-timestamp": ts, "x-zenith-signature": assinar(ts, corpo, "seg-teste") } }));
      return res.json();
    };
    const a = await enviar("w1", { id: "cmusiwfnh0c92mn0d606yyx09", amount: 14900, currency: "MXN" });
    expect(a.resultado).toMatch(/já registrada/);
    const b = await enviar("w2", { referenceId: "REF-1", amount: 14900, currency: "MXN" });
    expect(b.resultado).toMatch(/já registrada/);
    expect((await db.select().from(schema.vendas)).length).toBe(3);
    // deposit.credited novo (venda nova) cria normalmente
    const c = await enviar("w3", { id: "novo-id", referenceId: "REF-9", amount: 9900, currency: "MXN" });
    expect(c.resultado).toMatch(/criada/);
    expect((await db.select().from(schema.vendas)).length).toBe(4);
  });
});
