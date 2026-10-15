import { describe, expect, it } from "vitest";
import { calcularDRE, cardsProfitfy, porFormaPagamento, metasDoMes, aportesNoPeriodo, type Entrada, type ManualCalc } from "../src/lib/calculo";
import { parametrosPadrao, vendaZenith, metaLanc, iaLanc, brt, TZ, MARCO_ZERO, TAXA_USD } from "./fixtures";

const e = (vendas: Entrada["vendas"], lanc: Entrada["lancamentos"] = [], manuais: ManualCalc[] = []): Entrada => ({
  periodo: { inicio: brt("2026-10-05T00:00"), fim: brt("2026-10-06T00:00") }, parametros: parametrosPadrao(), vendas, lancamentos: lanc, manuais,
  opcoes: { tz: TZ, marcoZero: MARCO_ZERO, incluirHistorico: false, incluirManuais: true, cambio: (par) => (par === "USDBRL" ? TAXA_USD : 0.3) },
});

describe("cards estilo Profitfy e ROI (fonte: seção 3 da spec, sem mudar a DRE)", () => {
  it("cinco cards batem com a DRE; ROI = lucro ÷ (marketing + IA + taxas + imposto); CPA = marketing ÷ vendas", () => {
    const ent = e([vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T10:00") }), vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T12:00") })], [metaLanc({ instante: brt("2026-10-05T09:00"), valor: 10 }), iaLanc("kie", brt("2026-10-05T10:30"), 0.5)]);
    const d = calcularDRE(ent); const c = cardsProfitfy(d, null);
    expect(c.map((x) => x.chave)).toEqual(["lucro", "receita", "produtos", "marketing", "taxas"]);
    expect(c[0].valor).toBeCloseTo(d.totais.lucroLiquido); expect(c[2].valor).toBeCloseTo(0.5 * TAXA_USD); expect(c[3].valor).toBeCloseTo(10 / (1 - 0.1215));
    const taxas = d.totais.taxaZenithPct + d.totais.taxaZenithFixa + d.totais.cambioZenith + d.totais.impostoLucro;
    expect(c[4].valor).toBeCloseTo(taxas);
    expect(d.indicadores.roi).toBeCloseTo(d.totais.lucroLiquido / (d.totais.anunciosComImposto + d.totais.ia + taxas));
    expect(d.indicadores.cpa).toBeCloseTo(d.totais.anunciosComImposto / 2);
    // receita líquida + custos dos cards + lucro: lucro = receita − produtos − marketing − taxas(sem o imposto já incluso) ... conferência de fechamento
    expect(d.totais.lucroLiquido).toBeCloseTo(d.totais.receitaLiquida - d.totais.ia - d.totais.anunciosComImposto - d.totais.impostoLucro - d.totais.zapdata - d.totais.operacao + d.totais.entradasManuais, 6);
  });
  it("sem custos → ROI null; sem vendas → CPA null", () => {
    const d = calcularDRE(e([])); expect(d.indicadores.roi).toBeNull(); expect(d.indicadores.cpa).toBeNull();
  });
});

describe("por forma de pagamento", () => {
  it("OXXO/SPEI/outros com aprovadas, pendentes e conversão pela data do pedido", () => {
    const v = [
      vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T10:00"), metodo: "oxxo" }), vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T11:00"), metodo: "oxxo_cash", status: "pendente" }),
      vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T12:00"), metodo: "spei" }), vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T13:00"), metodo: "spei", status: "cancelada" }), vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T14:00"), metodo: null }),
    ];
    const f = porFormaPagamento(v, { inicio: brt("2026-10-05T00:00"), fim: brt("2026-10-06T00:00") });
    const oxxo = f.find((x) => x.forma === "OXXO")!, spei = f.find((x) => x.forma === "SPEI")!, outros = f.find((x) => x.forma === "outros")!;
    expect(oxxo).toMatchObject({ aprovadasQtd: 1, pendentesQtd: 1, outrasQtd: 0 }); expect(oxxo.conversao).toBeCloseTo(0.5);
    expect(spei).toMatchObject({ aprovadasQtd: 1, outrasQtd: 1 }); expect(spei.conversao).toBeCloseTo(0.5);
    expect(outros.aprovadasQtd).toBe(1); expect(outros.conversao).toBe(1);
  });
});

describe("metas do mês e aportes", () => {
  it("progresso, faltam e ritmo por dia; meta 0 não aparece", () => {
    const d = calcularDRE(e([vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T10:00") })]));
    const m = metasDoMes(d, d.totais.receitaLiquida * 4, 0, 10);
    expect(m).toHaveLength(1); expect(m[0].progresso).toBeCloseTo(0.25); expect(m[0].ritmoNecessarioPorDia).toBeCloseTo(d.totais.receitaLiquida * 3 / 10);
    expect(metasDoMes(d, 0, 0, 10)).toHaveLength(0);
  });
  it("aporte fica fora da DRE e é somado à parte", () => {
    const aporte: ManualCalc = { id: 1, tipo: "aporte", moeda: "BRL", valor: 1500, categoria: "sócios", linhaDre: "operacao", descricao: "Aporte Erick", frequencia: "unica", comecaEm: brt("2026-10-05T09:00"), terminaEm: null, ativo: true };
    const ent = e([vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-05T10:00") })], [], [aporte]);
    const com = calcularDRE(ent), sem = calcularDRE({ ...ent, manuais: [] });
    expect(com.totais.lucroLiquido).toBeCloseTo(sem.totais.lucroLiquido); expect(com.totais.entradasManuais).toBe(0);
    expect(aportesNoPeriodo(ent.manuais, ent.periodo, ent.opcoes.cambio).total).toBe(1500);
  });
});
