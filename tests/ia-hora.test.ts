import { describe, expect, it } from "vitest";
import { calcularDRE, iaPorVenda, iaPorHora, compararAntesDepois, lucroPorHora, rotuloMetodo, type Entrada } from "../src/lib/calculo";
import { parametrosPadrao, vendaZenith, iaLanc, metaLanc, brt, TZ, MARCO_ZERO, TAXA_USD } from "./fixtures";

const base = (vendas: Entrada["vendas"], lancamentos: Entrada["lancamentos"]): Entrada => ({
  periodo: { inicio: brt("2026-10-05T00:00"), fim: brt("2026-10-05T06:00") }, parametros: parametrosPadrao(), vendas, lancamentos, manuais: [],
  opcoes: { tz: TZ, marcoZero: MARCO_ZERO, incluirHistorico: false, incluirManuais: true, cambio: (par) => (par === "USDBRL" ? TAXA_USD : 0.3) },
});

describe("IA por venda (exibição)", () => {
  it("divide IA do período pelo nº de vendas, separa OpenAI/kie e compara com o ticket médio", () => {
    const e = base([vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T01:00") }), vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T02:00") })],
      [iaLanc("openai", brt("2026-10-05T01:10"), 1), iaLanc("kie", brt("2026-10-05T02:10"), 0.5)]);
    const dre = calcularDRE(e); const r = iaPorVenda(dre);
    expect(r.porVenda).toBeCloseTo(1.5 * TAXA_USD / 2, 6);
    expect(r.openaiPorVenda).toBeCloseTo(TAXA_USD / 2, 6);
    expect(r.kiePorVenda).toBeCloseTo(0.5 * TAXA_USD / 2, 6);
    expect(r.pctReceita).toBeCloseTo(dre.totais.ia / dre.totais.receitaLiquida, 9);
    expect(r.pctTicket).toBeCloseTo(r.porVenda! / dre.indicadores.ticketMedioLiquido!, 9);
    expect(r.semaforo).toBe("verde"); // ~4 R$ de IA sobre ticket ~39 R$ ≈ 10 %
  });
  it("semáforo: 25–40 % amarelo, acima de 40 % vermelho", () => {
    const v = [vendaZenith({ brutoMxn: 100, aprovadaEm: brt("2026-10-05T01:00") })]; // líquido 30·(1−0,0999)−1,5 = 25,53
    const amarelo = iaPorVenda(calcularDRE(base(v, [iaLanc("kie", brt("2026-10-05T01:10"), 25.53 * 0.3 / TAXA_USD)])));
    expect(amarelo.semaforo).toBe("amarelo");
    const vermelho = iaPorVenda(calcularDRE(base(v, [iaLanc("kie", brt("2026-10-05T01:10"), 25.53 * 0.5 / TAXA_USD)])));
    expect(vermelho.semaforo).toBe("vermelho");
  });
  it("sem venda: null com motivo, mas IA % da receita fica null também sem receita", () => {
    const r = iaPorVenda(calcularDRE(base([], [iaLanc("kie", brt("2026-10-05T01:10"), 1)])));
    expect(r.porVenda).toBeNull(); expect(r.semaforo).toBeNull(); expect(r.motivo).toMatch(/sem venda/); expect(r.pctReceita).toBeNull();
  });
});

describe("IA por hora (últimas 48 h)", () => {
  it("48 baldes de hora cheia, OpenAI e kie separados, fora da janela ignorado", () => {
    const agora = brt("2026-10-05T10:30");
    const p = iaPorHora([iaLanc("openai", brt("2026-10-05T10:05"), 2), iaLanc("kie", brt("2026-10-05T09:59"), 1), iaLanc("kie", brt("2026-10-03T10:00"), 9)], agora, TZ, 48);
    expect(p).toHaveLength(48);
    expect(p[47].rotulo).toBe("05/10 10h"); expect(p[47].openai).toBeCloseTo(2 * TAXA_USD); expect(p[47].kie).toBe(0);
    expect(p[46].kie).toBeCloseTo(TAXA_USD);
    expect(p.reduce((s, x) => s + x.kie + x.openai, 0)).toBeCloseTo(3 * TAXA_USD); // o de 03/10 10h está fora (48 h antes = 03/10 11h)
    const cmp = compararAntesDepois(p, brt("2026-10-05T10:00"))!;
    expect(cmp.horasDepois).toBe(1); expect(cmp.depoisPorHora).toBeCloseTo(2 * TAXA_USD); expect(cmp.antesPorHora).toBeCloseTo(TAXA_USD / 47);
  });
});

describe("lucro por hora com vendas marcadas", () => {
  it("soma das horas = DRE do período; vendas aprovadas viram pontos com método legível", () => {
    const e = base([vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T01:20"), metodo: "oxxo_cash" }), vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T03:00"), status: "pendente" })],
      [metaLanc({ instante: brt("2026-10-05T00:00"), valor: 10 }), metaLanc({ instante: brt("2026-10-05T04:00"), valor: 10 })]);
    const r = lucroPorHora(e, e.periodo, TZ);
    if ("indisponivel" in r) throw new Error(r.indisponivel);
    expect(r.pontos).toHaveLength(6);
    expect(r.pontos.map((p) => p.rotulo)).toEqual(["00h", "01h", "02h", "03h", "04h", "05h"]);
    const dre = calcularDRE(e);
    expect(r.pontos.reduce((s, p) => s + p.lucro, 0)).toBeCloseTo(dre.totais.lucroLiquido, 6);
    expect(r.pontos[5].acumulado).toBeCloseTo(dre.totais.lucroLiquido, 6);
    expect(r.pontos[0].lucro).toBeLessThan(0); // só Meta na hora 0
    expect(r.vendas).toHaveLength(1); // pendente fica fora
    expect(r.vendas[0]).toMatchObject({ rotulo: "05/10 01:20", brutoOriginal: 149, moeda: "MXN", metodo: "OXXO" });
  });
  it("mais de 7 dias → indisponível com orientação", () => {
    const e = base([], []);
    const r = lucroPorHora(e, { inicio: brt("2026-09-20T00:00"), fim: brt("2026-10-05T00:00") }, TZ);
    expect("indisponivel" in r && r.indisponivel).toMatch(/7 dias/);
  });
  it("método: spei/transfer → SPEI, oxxo/cash → OXXO, vazio → —", () => {
    expect(rotuloMetodo("spei")).toBe("SPEI"); expect(rotuloMetodo("bank_transfer")).toBe("SPEI"); expect(rotuloMetodo("OXXO")).toBe("OXXO"); expect(rotuloMetodo(null)).toBe("—");
  });
});
