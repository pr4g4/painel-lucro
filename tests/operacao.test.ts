import { describe, it, expect } from "vitest";
import { calcularDRE, faltaParaEmpatar, projecaoMes, gastoMetaPorHoraDoDia, gastoPorNumero, extrairNumeroWhatsapp, type Periodo } from "../src/lib/calculo";
import { brt, TZ, parametrosPadrao, vendaZenith, metaLanc, opcoes } from "./fixtures";

const P = (a: string, b: string): Periodo => ({ inicio: brt(a), fim: brt(b) });
const params = parametrosPadrao();
const perto = (a: number, b: number, tol = 0.005) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("falta para empatar", () => {
  it("com vendas: falta em R$ e em nº de vendas pelo ticket do dia; já no lucro → 0", () => {
    const periodo = P("2026-10-03T00:00", "2026-10-03T12:00");
    const vendas = [vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-03T10:00") })];
    const lanc = [metaLanc({ instante: brt("2026-10-03T09:00"), valor: 100 })];
    const dre = calcularDRE({ periodo, parametros: params, vendas, lancamentos: lanc, manuais: [], opcoes: opcoes() });
    const f = faltaParaEmpatar(dre);
    perto(f.faltaReceita, -dre.totais.lucroBruto, 1e-9);
    expect(f.vendasNecessarias).toBe(Math.ceil(f.faltaReceita / dre.indicadores.ticketMedioLiquido!));
    const lucro = calcularDRE({ periodo, parametros: params, vendas, lancamentos: [], manuais: [], opcoes: opcoes() });
    expect(faltaParaEmpatar(lucro)).toEqual({ faltaReceita: 0, vendasNecessarias: 0 });
  });
  it("sem venda: falta em R$ mas nº de vendas indisponível", () => {
    const dre = calcularDRE({ periodo: P("2026-10-03T00:00", "2026-10-03T12:00"), parametros: params, vendas: [], lancamentos: [metaLanc({ instante: brt("2026-10-03T09:00"), valor: 100 })], manuais: [], opcoes: opcoes() });
    const f = faltaParaEmpatar(dre);
    expect(f.vendasNecessarias).toBeNull();
    expect(f.motivo).toMatch(/ticket/);
  });
});

describe("projeção do mês", () => {
  it("menos de 1 dia → indisponível; 5 dias de 31 → multiplica por 31/5 a partir do início do mês", () => {
    const dre = calcularDRE({ periodo: P("2026-10-01T00:00", "2026-10-06T00:00"), parametros: params, vendas: [vendaZenith({ brutoMxn: 199, aprovadaEm: brt("2026-10-02T10:00"), historico: true })], lancamentos: [], manuais: [], opcoes: opcoes({ incluirHistorico: true }) });
    expect(projecaoMes(dre, brt("2026-10-01T10:00"), TZ)).toHaveProperty("indisponivel");
    const p = projecaoMes(dre, brt("2026-10-06T00:00"), TZ);
    if ("indisponivel" in p) throw new Error(p.indisponivel);
    perto(p.diasDecorridos, 5, 1e-9);
    expect(p.diasNoMes).toBe(31);
    perto(p.lucroLiquido, dre.totais.lucroLiquido * 31 / 5, 1e-6);
  });
  it("com marco zero no meio do mês, projeta só os dias a partir do marco", () => {
    const dre = calcularDRE({ periodo: P("2026-10-03T00:00", "2026-10-05T00:00"), parametros: params, vendas: [vendaZenith({ brutoMxn: 199, aprovadaEm: brt("2026-10-03T10:00") })], lancamentos: [], manuais: [], opcoes: opcoes() });
    const p = projecaoMes(dre, brt("2026-10-05T00:00"), TZ, brt("2026-10-03T00:00"));
    if ("indisponivel" in p) throw new Error(p.indisponivel);
    expect(p.diasConsiderados).toBe(29); // 03/10 → 31/10
    perto(p.lucroLiquido, dre.totais.lucroLiquido * 29 / 2, 1e-6);
  });
});

describe("gasto Meta por hora do dia e por número", () => {
  const periodo = P("2026-10-03T00:00", "2026-10-05T00:00");
  const lanc = [
    metaLanc({ instante: brt("2026-10-03T14:00"), valor: 10, campanha: "(9302) - 01 - REST. FOTO" }),
    metaLanc({ instante: brt("2026-10-04T14:00"), valor: 20, campanha: "(9302) - 02 - REST. FOTO" }),
    metaLanc({ instante: brt("2026-10-04T09:00"), valor: 5, campanha: "(8699) - 01 - REST. FOTO" }),
    metaLanc({ instante: brt("2026-10-04T09:00"), valor: 1, campanha: "campanha sem numero" }),
  ];
  it("soma por hora local com imposto; só dado por hora", () => {
    const h = gastoMetaPorHoraDoDia(lanc, periodo, TZ, params);
    if ("indisponivel" in h) throw new Error(h.indisponivel);
    perto(h[14], 30 / 0.8785, 1e-9); perto(h[9], 6 / 0.8785, 1e-9); expect(h[0]).toBe(0);
    const diario = lanc.map((l) => ({ ...l, granularidade: "dia" }));
    expect(gastoMetaPorHoraDoDia(diario, periodo, TZ, params)).toHaveProperty("indisponivel");
    expect(gastoMetaPorHoraDoDia([], periodo, TZ, params)).toHaveProperty("indisponivel");
  });
  it("agrupa por número do WhatsApp, com 'sem número' para o resto", () => {
    const g = gastoPorNumero(lanc, periodo, params);
    if ("indisponivel" in g) throw new Error(g.indisponivel);
    expect(g[0]).toMatchObject({ numero: "9302", campanhas: 2 }); perto(g[0].gasto, 30 / 0.8785, 1e-9);
    expect(g.find((x) => x.numero === "sem número")?.campanhas).toBe(1);
    expect(extrairNumeroWhatsapp("(6699) - 03 - X")).toBe("6699");
    expect(extrairNumeroWhatsapp("sem")).toBeNull();
  });
});

describe("correções 04/10: ROAS sem receita, projeção sem receita", () => {
  it("ROAS é null (—) quando não há receita; projeção indisponível sem receita no mês", () => {
    const periodo = P("2026-10-03T00:00", "2026-10-04T00:00");
    const dre = calcularDRE({ periodo, parametros: params, vendas: [], lancamentos: [metaLanc({ instante: brt("2026-10-03T09:00"), valor: 100 })], manuais: [], opcoes: opcoes() });
    expect(dre.indicadores.roas).toBeNull();
    expect(dre.indicadores.poas).not.toBeNull();
    const p = projecaoMes(dre, brt("2026-10-06T00:00"), TZ, brt("2026-10-03T00:00"));
    expect("indisponivel" in p && p.indisponivel).toMatch(/sem receita ainda/);
  });
});
