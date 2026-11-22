import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { normalizarMoeda, paisDaMoeda } from "../src/lib/moedas";

describe("moedas", () => {
  it("normaliza códigos de 3 letras e nunca assume MXN", () => {
    expect(normalizarMoeda("ars")).toBe("ARS"); expect(normalizarMoeda(" COP ")).toBe("COP");
    expect(normalizarMoeda(undefined)).toBeNull(); expect(normalizarMoeda("")).toBeNull(); expect(normalizarMoeda("PESO")).toBeNull();
    expect(paisDaMoeda("ARS")).toBe("AR"); expect(paisDaMoeda("COP")).toBe("CO"); expect(paisDaMoeda("MXN")).toBe("MX");
  });
});

/** Pedido 6 (22/11): ARS e COP eram gravadas como MXN (R$ 2.131 em vez de ~R$ 30). */
describe.skipIf(!process.env.DATABASE_URL)("vendas em outras moedas (banco local)", () => {
  let db: typeof import("../src/db").db; let schema: typeof import("../src/db").schema;
  let POST: typeof import("../src/app/api/zenith/webhook/route").POST;
  let assinar: typeof import("../src/coletores/zenith-webhook").assinar;
  let aplicar: typeof import("../src/coletores/zenith-aplicar");
  let cambioMod: typeof import("../src/coletores/cambio");
  const { NextRequest } = require("next/server") as typeof import("next/server");
  const SEG = "seg-moedas";
  const enviar = async (id: string, type: string, data: Record<string, unknown>) => {
    const corpo = JSON.stringify({ id, type, data }); const ts = String(Date.now());
    const res = await POST(new NextRequest("http://localhost/api/zenith/webhook", { method: "POST", body: corpo, headers: { "x-zenith-event-id": id, "x-zenith-event-type": type, "x-zenith-timestamp": ts, "x-zenith-signature": assinar(ts, corpo, SEG) } }));
    return res.json();
  };
  const venda = async (idOrigem: string) => (await db.select().from(schema.vendas)).find((v) => v.idOrigem === idOrigem);
  beforeAll(async () => {
    process.env.ZENITH_WEBHOOK_SECRET = SEG;
    ({ db, schema } = await import("../src/db"));
    ({ POST } = await import("../src/app/api/zenith/webhook/route"));
    ({ assinar } = await import("../src/coletores/zenith-webhook"));
    aplicar = await import("../src/coletores/zenith-aplicar");
    cambioMod = await import("../src/coletores/cambio");
    await db.execute(sql`truncate zenith_eventos, vendas, avisos, coletas, cambio restart identity`);
    await db.execute(sql`insert into cambio (dia, par, taxa, fonte) values ('2026-11-20','MXNBRL','0.30','ptax')`);
    // câmbio das outras moedas vem de um cliente de mentira (sem rede)
    cambioMod.definirClienteCambio({
      ptaxUsd: async () => [], ecbMxn: async () => [],
      moedaBrl: async (m) => ({ cotacoes: [{ dia: "2026-11-20", taxa: m === "ARS" ? 0.0044 : m === "COP" ? 0.00136 : 0.5 }], fonte: "currency_api", estimada: true }),
    });
  });

  it("ARS aprovada e ARS pendente viram ARS com taxa própria (≈ R$ 30), COP pendente ≈ R$ 27; nada vira MXN", async () => {
    const a = await enviar("arg1", "payment.captured", { id: "ars-aprov", amount: 690000, currency: "ARS", paymentMethod: "BANK_TRANSFER", capturedAt: "2026-11-22T12:00:00Z" });
    expect(a.resultado).toMatch(/criada/);
    const p = await enviar("arg2", "payment.pending", { id: "ars-pend", amount: 690000, currency: "ars", paymentMethod: "CBU", createdAt: "2026-11-22T12:05:00Z" });
    expect(p.resultado).toMatch(/criada/);
    const c = await enviar("col1", "payment.pending", { id: "cop-pend", amount: 1990000, currency: "COP", paymentMethod: "BREB", createdAt: "2026-11-22T12:10:00Z" });
    expect(c.resultado).toMatch(/criada/);
    const va = (await venda("ars-aprov"))!, vp = (await venda("ars-pend"))!, vc = (await venda("cop-pend"))!;
    expect([va.moeda, vp.moeda, vc.moeda]).toEqual(["ARS", "ARS", "COP"]);
    expect(va.status).toBe("aprovada"); expect(vp.status).toBe("pendente");
    expect(Number(va.brutoOriginal)).toBe(6900);
    expect(Number(va.brutoBrl)).toBeCloseTo(6900 * 0.0044, 4); // R$ 30,36, não R$ 2.131
    expect(Number(vc.brutoBrl)).toBeCloseTo(19900 * 0.00136, 4); // R$ 27,06, não R$ 6.146
    expect(Number(va.brutoBrl)).toBeLessThan(40);
    expect((va.payload as { cambioEstimado?: boolean }).cambioEstimado).toBe(true);
    // líquido coerente: bruto − 7,99% − 2% (sem taxa fixa em MX$ para ARS)
    expect(Number(va.liquidoBrl)).toBeCloseTo(Number(va.brutoBrl) * (1 - 0.0799 - 0.02), 3);
  });

  it("evento sem moeda não vira venda (nunca cai em MXN) e abre aviso de formato", async () => {
    const r = await enviar("semmoeda", "payment.captured", { id: "sem-moeda", amount: 10000, capturedAt: "2026-11-22T13:00:00Z" });
    expect(r.resultado).toMatch(/ignorado: moeda ausente/);
    expect(await venda("sem-moeda")).toBeUndefined();
  });

  it("moeda sem taxa: a venda NÃO entra, abre aviso sem_cambio; quando a taxa chega, o reprocessamento cria a venda e fecha o aviso", async () => {
    cambioMod.definirClienteCambio({ ptaxUsd: async () => [], ecbMxn: async () => [], moedaBrl: async () => ({ cotacoes: [], fonte: "currency_api", estimada: true }) });
    const r = await enviar("clp1", "payment.captured", { id: "clp-1", amount: 5000000, currency: "CLP", capturedAt: "2026-11-22T14:00:00Z" });
    expect(r.resultado).toMatch(/erro:.*sem câmbio CLP/);
    expect(await venda("clp-1")).toBeUndefined();
    const avisos = await db.select().from(schema.avisos);
    expect(avisos.some((x) => x.tipo === "sem_cambio" && !x.resolvidoEm)).toBe(true);
    await db.execute(sql`insert into cambio (dia, par, taxa, fonte, provisoria) values ('2026-11-20','CLPBRL','0.0056','currency_api', true)`);
    (await import("../src/lib/memoria")).esquecerMemoria("cambio:");
    const rep = await aplicar.reprocessarEventosZenith();
    expect(rep.ok).toBe(1);
    const v = (await venda("clp-1"))!;
    expect(v.moeda).toBe("CLP"); expect(Number(v.brutoBrl)).toBeCloseTo(50000 * 0.0056, 4);
    expect((await db.select().from(schema.avisos)).filter((x) => x.tipo === "sem_cambio" && !x.resolvidoEm)).toHaveLength(0);
  });

  it("deduções do evento (deducoes_totais plausíveis) valem mais que os parâmetros; implausíveis são ignoradas", async () => {
    await enviar("ded1", "payment.captured", { id: "ars-ded", amount: 100000, currency: "ARS", deducoes_totais: 15000, capturedAt: "2026-11-22T15:00:00Z" }); // 150 de 1000 = 15%
    const v = (await venda("ars-ded"))!;
    expect(Number(v.taxaPctBrl) + Number(v.taxaFixaBrl) + Number(v.cambioPctBrl)).toBeCloseTo(150 * 0.0044, 5);
    expect((v.payload as { deducoes?: string }).deducoes).toBe("evento");
    await enviar("ded2", "payment.captured", { id: "ars-ded2", amount: 100000, currency: "ARS", deducoes_totais: 99000, capturedAt: "2026-11-22T15:01:00Z" }); // 990 de 1000: implausível
    expect(((await venda("ars-ded2"))!.payload as { deducoes?: string }).deducoes).toBe("parametros");
  });

  it("as 3 vendas erradas já gravadas como MXN são corrigidas uma vez; sem taxa ficam fora da receita com aviso; segunda rodada não faz nada", async () => {
    await db.execute(sql`delete from avisos`);
    const pl = (cur: string, metodo: string) => JSON.stringify({ eventoId: "e", tipo: "payment.captured", familia: "pagamento", metodo, data: { currency: cur, amount: 0, paymentMethod: metodo }, ids: [] });
    const ins = async (id: string, status: string, cur: string, bruto: number, brl: number, metodo: string) => db.execute(sql`insert into vendas (fonte, id_origem, status, criada_em, aprovada_em, moeda, bruto_original, taxa_cambio, bruto_brl, taxa_pct_brl, taxa_fixa_brl, cambio_pct_brl, liquido_brl, reserva_brl, historico, payload)
      values ('zenith', ${id}, ${status}, '2026-11-22T12:00:00Z', ${status === "aprovada" ? "2026-11-22T12:00:00Z" : null}, 'MXN', ${bruto}, 0.3089, ${brl}, 0, 0, 0, ${brl}, 0, false, ${pl(cur, metodo)}::jsonb)`);
    await ins("errada-ars-aprov", "aprovada", "ARS", 6900, 2131.06, "BANK_TRANSFER");
    await ins("errada-ars-pend", "pendente", "ARS", 6900, 2131.06, "CBU");
    await ins("errada-cop-pend", "pendente", "COP", 19900, 6146.10, "BREB");
    // COP sem taxa por enquanto
    cambioMod.definirClienteCambio({ ptaxUsd: async () => [], ecbMxn: async () => [], moedaBrl: async (m) => ({ cotacoes: m === "ARS" ? [{ dia: "2026-11-20", taxa: 0.0044 }] : [], fonte: "currency_api", estimada: true }) });
    await db.execute(sql`delete from cambio where par = 'COPBRL'`); (await import("../src/lib/memoria")).esquecerMemoria("cambio:");
    // COPBRL já foi gravada pelo primeiro teste (taxa existe): removida acima para simular a falta
    const r1 = await aplicar.corrigirMoedasVendas();
    expect(r1.corrigidas).toHaveLength(2); expect(r1.aguardandoCambio).toHaveLength(1);
    const a = (await venda("errada-ars-aprov"))!; expect(a.moeda).toBe("ARS"); expect(Number(a.brutoBrl)).toBeCloseTo(30.36, 2); expect(a.historico).toBe(false);
    const c = (await venda("errada-cop-pend"))!; expect(c.moeda).toBe("COP"); expect(c.historico).toBe(true); expect(c.observacao).toMatch(/aguardando câmbio COP/);
    expect((await db.select().from(schema.avisos)).some((x) => x.tipo === "sem_cambio" && !x.resolvidoEm)).toBe(true);
    // a taxa do COP chega → a próxima rodada termina o trabalho e fecha o aviso
    await db.execute(sql`insert into cambio (dia, par, taxa, fonte, provisoria) values ('2026-11-20','COPBRL','0.00136','currency_api', true)`); (await import("../src/lib/memoria")).esquecerMemoria("cambio:");
    const r2 = await aplicar.corrigirMoedasVendas();
    expect(r2.corrigidas).toHaveLength(1); expect(r2.aguardandoCambio).toHaveLength(0);
    const c2 = (await venda("errada-cop-pend"))!; expect(Number(c2.brutoBrl)).toBeCloseTo(27.06, 2); expect(c2.historico).toBe(false);
    expect((await db.select().from(schema.avisos)).filter((x) => x.tipo === "sem_cambio" && !x.resolvidoEm)).toHaveLength(0);
    // idempotente
    const r3 = await aplicar.corrigirMoedasVendas();
    expect(r3.corrigidas).toHaveLength(0); expect(r3.aguardandoCambio).toHaveLength(0);
  });

  it("resumo: vendas por país no período", async () => {
    const res = await import("../src/lib/resumos");
    const e = await res.entradaDireta({ inicio: new Date("2026-11-01T03:00:00Z"), fim: new Date("2026-11-23T03:00:00Z") });
    const v = res.vendasPorMoeda(e, { inicio: new Date("2026-11-22T03:00:00Z"), fim: new Date("2026-11-23T03:00:00Z") }, true);
    const ars = v.find((x) => x.moeda === "ARS")!; expect(ars.aprovadas).toBeGreaterThanOrEqual(1); expect(ars.geradas).toBeGreaterThan(ars.aprovadas);
    expect(v.find((x) => x.moeda === "COP")).toBeDefined();
  });
});
