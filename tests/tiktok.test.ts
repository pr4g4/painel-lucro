import { describe, expect, it, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { lerCsvTikTok, explicarErroTikTok, type TikTokCliente } from "../src/coletores/tiktok";
import { calcularDRE, type Entrada, type LancamentoCalc } from "../src/lib/calculo";
import { parametrosPadrao, vendaZenith, metaLanc, brt, TZ, MARCO_ZERO, TAXA_USD } from "./fixtures";

const tiktokLanc = (instante: Date, brl: number): LancamentoCalc => ({ ...metaLanc({ instante, valor: brl, conta: "tiktok:123", campanha: "tt1" }), fonte: "tiktok", descricao: "Fotos IA MX - TT" });

describe("TikTok na DRE (motor puro)", () => {
  const base = (lanc: LancamentoCalc[], params = parametrosPadrao()): Entrada => ({
    periodo: { inicio: brt("2026-10-05T00:00"), fim: brt("2026-10-06T00:00") }, parametros: params, vendas: [vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T10:00") })], lancamentos: lanc, manuais: [],
    opcoes: { tz: TZ, marcoZero: MARCO_ZERO, incluirHistorico: false, incluirManuais: true, cambio: (par) => (par === "USDBRL" ? TAXA_USD : 0.3) },
  });
  it("sem TikTok nada muda: linhas não aparecem e anúncios = Meta", () => {
    const r = calcularDRE(base([metaLanc({ instante: brt("2026-10-05T09:00"), valor: 10 })]));
    expect(r.linhas.find((l) => l.chave === "tiktok_exibido")).toBeUndefined();
    expect(r.totais.anunciosComImposto).toBeCloseTo(r.totais.metaComImposto); expect(r.totais.tiktokComImposto).toBe(0);
  });
  it("com TikTok: linha própria, imposto do parâmetro (0 por padrão), soma nos custos e no ROAS", () => {
    const r = calcularDRE(base([metaLanc({ instante: brt("2026-10-05T09:00"), valor: 10 }), tiktokLanc(brt("2026-10-05T11:00"), 20)]));
    expect(r.linhas.find((l) => l.chave === "tiktok_exibido")?.valor).toBeCloseTo(-20);
    expect(r.totais.tiktokComImposto).toBeCloseTo(20); expect(r.totais.tiktokImposto).toBe(0);
    expect(r.totais.anunciosComImposto).toBeCloseTo(10 / (1 - 0.1215) + 20);
    expect(r.totais.custosTotais).toBeCloseTo(r.totais.anunciosComImposto + r.totais.zapdata + r.totais.ia + r.totais.operacao);
    expect(r.indicadores.roas).toBeCloseTo(r.totais.receitaLiquida / r.totais.anunciosComImposto);
    const comImposto = calcularDRE(base([tiktokLanc(brt("2026-10-05T11:00"), 20)], [...parametrosPadrao().filter((p) => p.chave !== "imposto_tiktok_pct"), { chave: "imposto_tiktok_pct", valor: "10", vigenciaInicio: new Date("2026-09-01T03:00:00Z"), vigenciaFim: null }]));
    expect(comImposto.totais.tiktokComImposto).toBeCloseTo(20 / 0.9); expect(comImposto.totais.tiktokImposto).toBeCloseTo(20 / 0.9 - 20);
  });
});

describe("CSV do TikTok Ads Manager", () => {
  it("por dia em português, custo com vírgula; linha Total ignorada", () => {
    const csv = "Nome da campanha,Data,Custo\nFotos IA MX - TT,2026-10-11,\"1.234,56\"\nCenas - TT,11/10/2026,\"23,40\"\nTotal,,\"1.257,96\"\n";
    const l = lerCsvTikTok(csv);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ campanha: "Fotos IA MX - TT", custo: 1234.56, granularidade: "dia" }); expect(l[0].quando.toISOString()).toBe("2026-10-11T03:00:00.000Z");
    expect(l[1].custo).toBeCloseTo(23.4);
  });
  it("por hora em inglês com ponto decimal e id da campanha", () => {
    const csv = "Campaign name\tCampaign ID\tBy hour\tCost\nFotos IA MX - TT\t17000\t2026-10-11 13:00\t12.50\n";
    const l = lerCsvTikTok(csv);
    expect(l[0]).toMatchObject({ campanhaId: "17000", custo: 12.5, granularidade: "hora" }); expect(l[0].quando.toISOString()).toBe("2026-10-11T16:00:00.000Z");
  });
  it("sem colunas reconhecíveis → vazio; erro de token em português", () => {
    expect(lerCsvTikTok("a,b\n1,2\n")).toHaveLength(0);
    expect(explicarErroTikTok(40105, "Access token is incorrect")).toMatch(/TIKTOK_ACCESS_TOKEN/);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("coleta TikTok (banco local)", () => {
  let db: typeof import("../src/db").db;
  beforeAll(async () => { ({ db } = await import("../src/db")); });
  it("grava gasto por hora convertido pelo câmbio do dia, campanhas com frente, e aparece na DRE", async () => {
    const { coletarTikTok } = await import("../src/coletores/tiktok");
    await db.execute(sql`delete from lancamentos where fonte = 'tiktok'`); await db.execute(sql`delete from campanhas where conta_id like 'tiktok:%'`);
    await db.execute(sql`insert into cambio (dia, par, taxa, fonte) values ('2026-10-05', 'USDBRL', '5.40', 'ptax') on conflict (dia, par) do update set taxa = '5.40'`);
    const fake: TikTokCliente = {
      async conta() { return { id: "123", nome: "Conta TT", moeda: "USD", fuso: "America/Sao_Paulo" }; },
      async relatorio() { return { linhas: [{ campaign_id: "tt1", campaign_name: "(9302) Fotos IA MX - TT", spend: 2, stat_time: "2026-10-05 10:00:00" }, { campaign_id: "tt1", campaign_name: "(9302) Fotos IA MX - TT", spend: 3, stat_time: "2026-10-05 11:00:00" }], granularidade: "hora" }; },
      async campanhas() { return [{ id: "tt1", name: "(9302) Fotos IA MX - TT", status: "ACTIVE" }]; },
    };
    const r = await coletarTikTok(fake, ["123"], brt("2026-10-05T12:00"), 24);
    expect(r.ok).toBe(true); expect(r.registros).toBe(2);
    const rows = await db.execute(sql`select valor_brl, numero_whatsapp from lancamentos l join campanhas c on c.campanha_id = l.campanha_id and c.conta_id = l.conta_id where l.fonte = 'tiktok' order by l.instante`) as unknown as { valor_brl: string; numero_whatsapp: string }[];
    expect(Number(rows[0].valor_brl)).toBeCloseTo(2 * 5.4); expect(rows[0].numero_whatsapp).toBe("9302");
    await coletarTikTok(fake, ["123"], brt("2026-10-05T12:00"), 24); // idempotente
    const [n] = await db.execute(sql`select count(*)::int as n from lancamentos where fonte = 'tiktok'`) as unknown as { n: number }[];
    expect(n.n).toBe(2);
    await db.execute(sql`delete from lancamentos where fonte = 'tiktok'`); await db.execute(sql`delete from campanhas where conta_id like 'tiktok:%'`);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("TikTok: API substitui CSV no mesmo dia e CSV não duplica o que veio da API", () => {
  it("CSV → API (mesma campanha, mesmo dia) remove o CSV; CSV de novo é ignorado; outro dia fica", async () => {
    const { db } = await import("../src/db");
    const { coletarTikTok, importarCsvTikTok, lerCsvTikTok } = await import("../src/coletores/tiktok");
    await db.execute(sql`delete from lancamentos where fonte = 'tiktok'`); await db.execute(sql`delete from campanhas where conta_id like 'tiktok:%'`);
    await db.execute(sql`insert into cambio (dia, par, taxa, fonte) values ('2026-10-04', 'USDBRL', '5.40', 'ptax') on conflict (dia, par) do update set taxa = '5.40'`);
    const csv = "Nome da campanha,Data,Custo\nVAV - SITE - 3 LPs - 45+ - TIKTOK,2026-10-05,\"58,20\"\nVAV - SITE - 3 LPs - 45+ - TIKTOK,2026-10-04,\"10,00\"\n";
    const imp = await importarCsvTikTok(lerCsvTikTok(csv), "BRL");
    expect(imp.ok).toBe(true); expect(imp.registros).toBe(2);
    const fake: TikTokCliente = {
      async conta() { return { id: "7685204406018605072", nome: "Conta TT", moeda: "BRL", fuso: "America/Sao_Paulo" }; },
      async relatorio() { return { linhas: [{ campaign_id: "tt9", campaign_name: "VAV - SITE - 3 LPs - 45+ - TIKTOK", spend: 30, stat_time: "2026-10-05 10:00:00" }, { campaign_id: "tt9", campaign_name: "VAV - SITE - 3 LPs - 45+ - TIKTOK", spend: 28.2, stat_time: "2026-10-05 15:00:00" }], granularidade: "hora" }; },
      async campanhas() { return [{ id: "tt9", name: "VAV - SITE - 3 LPs - 45+ - TIKTOK", status: "ACTIVE" }]; },
    };
    const r = await coletarTikTok(fake, ["7685204406018605072"], brt("2026-10-05T16:00"), 24);
    expect(r.ok).toBe(true); expect((r.detalhe as Record<string, { csvSubstituidas?: number }>)["7685204406018605072"].csvSubstituidas).toBe(1);
    const soma = async (dia: string) => Number((await db.execute(sql`select coalesce(sum(valor_brl), 0)::float as s from lancamentos where fonte = 'tiktok' and instante >= ${`${dia}T03:00:00Z`}::timestamptz and instante < (${`${dia}T03:00:00Z`}::timestamptz + interval '1 day')`) as unknown as { s: number }[])[0].s);
    expect(await soma("2026-10-05")).toBeCloseTo(58.2); // só a API (30 + 28,20), sem o CSV de 58,20 somado
    expect(await soma("2026-10-04")).toBeCloseTo(10); // dia que a API não trouxe continua com o CSV
    const imp2 = await importarCsvTikTok(lerCsvTikTok(csv), "BRL");
    expect(imp2.ok).toBe(true); expect((imp2.detalhe as { ignoradasJaNaApi?: number }).ignoradasJaNaApi).toBe(1);
    expect(await soma("2026-10-05")).toBeCloseTo(58.2);
    await db.execute(sql`delete from lancamentos where fonte = 'tiktok'`); await db.execute(sql`delete from campanhas where conta_id like 'tiktok:%'`);
  });
});
