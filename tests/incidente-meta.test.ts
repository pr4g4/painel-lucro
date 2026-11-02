import { describe, expect, it, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { textoDesde } from "../src/lib/hoje";
import { mensagemMigracao } from "../src/db/esquema";
import { brt } from "./fixtures";
import type { MetaCliente, MetaLinha } from "../src/coletores/meta";

describe("faixa vermelha: desde quando", () => {
  const agora = brt("2026-11-01T23:30");
  it("hoje só a hora; outro dia com data e há N dias", () => {
    expect(textoDesde(brt("2026-11-01T18:10"), agora, "America/Sao_Paulo")).toBe("18:10");
    expect(textoDesde(brt("2026-10-14T23:50"), agora, "America/Sao_Paulo")).toBe("14/10 23:50 (há 18 dias)");
    expect(textoDesde(brt("2026-10-31T22:00"), agora, "America/Sao_Paulo")).toBe("31/10 22:00 (há 1 dia)");
    expect(textoDesde(null, agora, "America/Sao_Paulo")).toBe("o início");
  });
  it("mensagem da migração pendente nomeia o arquivo e o que falta", () => {
    expect(mensagemMigracao([{ migracao: "0004_aporte_e_ads.sql", item: "coluna campanhas.orcamento_diario", comando: "" }])).toMatch(/Migração 0004 pendente: rode drizzle\/0004_aporte_e_ads\.sql/);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("incidente Meta (banco local)", () => {
  let db: typeof import("../src/db").db;
  beforeAll(async () => { ({ db } = await import("../src/db")); });
  const linhasDia = (dia: string, horas: number[], spend = 1): MetaLinha[] => horas.map((h) => ({ campaign_id: "c1", campaign_name: "(9302) - 01 - REST. FOTO", spend: String(spend), date_start: dia, hourly_stats_aggregated_by_advertiser_time_zone: `${String(h).padStart(2, "0")}:00:00 - ${String(h).padStart(2, "0")}:59:59` }));
  const cliente = (opts: { campanhasFalham?: boolean } = {}): MetaCliente => ({
    async fuso() { return "America/Sao_Paulo"; },
    async insights(_c, de, ate) { const dias: string[] = []; for (let d = new Date(`${de}T12:00:00Z`); d.toISOString().slice(0, 10) <= ate; d = new Date(d.getTime() + 86_400_000)) dias.push(d.toISOString().slice(0, 10)); return { linhas: dias.flatMap((d) => linhasDia(d, [10, 11, 12])), granularidade: "hora", fusoConta: "America/Sao_Paulo" }; },
    async campanhas() { if (opts.campanhasFalham) throw new Error("Failed query: insert into campanhas (orcamento_diario)"); return [{ id: "c1", name: "(9302) - 01 - REST. FOTO", effective_status: "ACTIVE", daily_budget: "5000", moeda: "BRL" }]; },
  });
  it("recuperação dia a dia grava por hora e é idempotente; devolve 'proximo' quando estoura o tempo", async () => {
    const { recuperarMeta } = await import("../src/coletores/meta");
    await db.execute(sql`delete from lancamentos where fonte = 'meta' and conta_id = 'act_teste'`);
    const r = await recuperarMeta(cliente(), ["act_teste"], "2026-10-15", "2026-10-17", 45_000, 0);
    expect(r.dias).toHaveLength(3); expect(r.proximo).toBeNull(); expect(r.chamadas).toBe(3);
    const n = async () => Number((await db.execute(sql`select count(*)::int as n, coalesce(sum(valor_brl), 0)::float as s from lancamentos where fonte = 'meta' and conta_id = 'act_teste'`) as unknown as { n: number; s: number }[])[0].n);
    expect(await n()).toBe(9);
    const r2 = await recuperarMeta(cliente(), ["act_teste"], "2026-10-15", "2026-10-17", 45_000, 0);
    expect(r2.dias.reduce((s, d) => s + d.gravados, 0)).toBe(9); expect(await n()).toBe(9); // rodar de novo não duplica
    const r3 = await recuperarMeta(cliente(), ["act_teste"], "2026-10-15", "2026-10-20", 0, 0); // sem tempo: para no primeiro dia
    expect(r3.proximo).toBe("2026-10-15"); expect(r3.dias).toHaveLength(0);
    await db.execute(sql`delete from lancamentos where fonte = 'meta' and conta_id = 'act_teste'`);
  });
  it("se gravar campanhas falhar, o gasto fica gravado e a coleta é ok, com aviso separado", async () => {
    const { coletarMeta } = await import("../src/coletores/meta");
    await db.execute(sql`delete from lancamentos where fonte = 'meta' and conta_id = 'act_teste2'`);
    await db.execute(sql`delete from avisos where tipo = 'metadados_campanhas'`);
    const r = await coletarMeta(cliente({ campanhasFalham: true }), ["act_teste2"], brt("2026-10-16T13:00"), 24);
    expect(r.ok).toBe(true); expect(r.registros).toBeGreaterThan(0);
    const [a] = await db.execute(sql`select mensagem from avisos where tipo = 'metadados_campanhas' and resolvido_em is null`) as unknown as { mensagem: string }[];
    expect(a?.mensagem).toMatch(/gasto gravado/);
    await db.execute(sql`delete from lancamentos where fonte = 'meta' and conta_id = 'act_teste2'`); await db.execute(sql`delete from avisos where tipo = 'metadados_campanhas'`);
  });
  it("fonte não configurada não conta como falha seguida", async () => {
    const { lerColetasBruto } = await import("../src/lib/dados");
    await db.execute(sql`delete from coletas where fonte = 'tiktok'`);
    for (let i = 0; i < 5; i++) await db.execute(sql`insert into coletas (fonte, terminada_em, ok, registros, erro) values ('tiktok', now(), false, 0, 'não configurada (TIKTOK_ACCESS_TOKEN)')`);
    const c = (await lerColetasBruto()).find((x) => x.fonte === "tiktok")!;
    expect(c.erro).toMatch(/não configurada/); expect(c.falhasSeguidas).toBe(0);
    await db.execute(sql`delete from coletas where fonte = 'tiktok'`);
  });
  it("verificação de esquema: banco local já tem a 0004 → nada pendente", async () => {
    const { verificarEsquema } = await import("../src/db/esquema");
    const r = await verificarEsquema(true);
    expect(r.ok).toBe(true); expect(r.pendentes).toHaveLength(0);
  });
});
