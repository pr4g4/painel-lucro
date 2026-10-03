import { describe, it, expect } from "vitest";
import {
  calcularDRE, parametroVigente, numeroVigente, fatorImpostoMeta, periodoAnterior, resolverAtalho,
  valorNoPeriodo, granularidadeAutomatica, fatiar, type Parametro, type Periodo,
} from "../src/lib/calculo";
import { brt, MARCO_ZERO, TZ, parametrosPadrao, vendaZenith, metaLanc, iaLanc, zapdataManual, manual, opcoes, TAXA_USD } from "./fixtures";

const P = (a: string, b: string): Periodo => ({ inicio: brt(a), fim: brt(b) });
const perto = (a: number, b: number, tol = 0.005) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("parâmetros com vigência", () => {
  it("usa o valor vigente na data do lançamento; mudar hoje não altera o passado", () => {
    const params: Parametro[] = [
      { chave: "imposto_meta_pct", valor: "12.15", vigenciaInicio: brt("2026-09-01T00:00"), vigenciaFim: brt("2026-10-10T00:00") },
      { chave: "imposto_meta_pct", valor: "15", vigenciaInicio: brt("2026-10-10T00:00"), vigenciaFim: null },
    ];
    expect(numeroVigente(params, "imposto_meta_pct", brt("2026-10-02T12:00"))).toBe(12.15);
    expect(numeroVigente(params, "imposto_meta_pct", brt("2026-10-10T00:00"))).toBe(15);
    expect(numeroVigente(params, "imposto_meta_pct", brt("2026-10-09T23:59"))).toBe(12.15);
    expect(parametroVigente(params, "imposto_meta_pct", brt("2026-08-01T00:00"))).toBeNull();
  });

  it("fator Meta: 12,15% → 1,1383; R$ 315,29 exibidos → R$ 358,89 com imposto", () => {
    perto(fatorImpostoMeta(12.15), 1.1383, 0.0001);
    perto(315.29 * fatorImpostoMeta(12.15), 358.89, 0.01);
  });
});

describe("períodos", () => {
  it("'Hoje' compara com 'ontem até a mesma hora'", () => {
    const agora = brt("2026-10-03T15:30");
    const { periodo } = resolverAtalho("hoje", agora, MARCO_ZERO, TZ);
    expect(periodo.inicio.toISOString()).toBe(brt("2026-10-03T00:00").toISOString());
    const ant = periodoAnterior(periodo, TZ);
    expect(ant.inicio.toISOString()).toBe(brt("2026-10-02T00:00").toISOString());
    expect(ant.fim.toISOString()).toBe(brt("2026-10-02T15:30").toISOString());
  });
  it("últimas 6 h comparam com as 6 h anteriores", () => {
    const agora = brt("2026-10-03T15:30");
    const { periodo } = resolverAtalho("ultimas_6h", agora, MARCO_ZERO, TZ);
    const ant = periodoAnterior(periodo, TZ);
    expect(ant.inicio.toISOString()).toBe(brt("2026-10-03T03:30").toISOString());
    expect(ant.fim.toISOString()).toBe(brt("2026-10-03T09:30").toISOString());
  });
  it("granularidade automática e fatias alinhadas ao fuso", () => {
    expect(granularidadeAutomatica(P("2026-10-03T00:00", "2026-10-05T00:00"))).toBe("hora");
    expect(granularidadeAutomatica(P("2026-10-03T00:00", "2026-10-05T00:01"))).toBe("dia");
    const f = fatiar(P("2026-10-01T00:00", "2026-10-04T12:00"), "dia", TZ);
    expect(f).toHaveLength(4);
    expect(f[3].fim.toISOString()).toBe(brt("2026-10-04T12:00").toISOString());
    expect(fatiar(P("2026-10-03T10:30", "2026-10-03T13:00"), "hora", TZ)).toHaveLength(3);
  });
});

describe("recorrentes diluídos (fórmula 4)", () => {
  const zap = zapdataManual(); // mensal, começa 02/10/2026 00:00 BRT
  it("ciclo de outubro (02/10 → 01/11) = 31 dias; o mês inteiro soma R$ 119,00", () => {
    perto(valorNoPeriodo(zap, P("2026-10-02T00:00", "2026-11-02T00:00"), TZ), 119);
  });
  it("um dia = 119 ÷ 31; uma hora = 119 ÷ 31 ÷ 24; nada antes do início", () => {
    perto(valorNoPeriodo(zap, P("2026-10-03T00:00", "2026-10-04T00:00"), TZ), 119 / 31);
    perto(valorNoPeriodo(zap, P("2026-10-03T14:00", "2026-10-03T15:00"), TZ), 119 / 31 / 24, 1e-9);
    expect(valorNoPeriodo(zap, P("2026-09-20T00:00", "2026-10-02T00:00"), TZ)).toBe(0);
  });
  it("atravessa ciclos: 02/10 → 02/12 = 119 (out, 31 d) + 119 (nov, 30 d)", () => {
    perto(valorNoPeriodo(zap, P("2026-10-02T00:00", "2026-12-02T00:00"), TZ), 238);
  });
  it("respeita término e frequência diária/semanal/única", () => {
    const zapFim = zapdataManual(brt("2026-10-02T00:00"), brt("2026-10-17T00:00"));
    perto(valorNoPeriodo(zapFim, P("2026-10-02T00:00", "2026-11-02T00:00"), TZ), 119 * 15 / 31);
    const diaria = manual({ valor: 24, frequencia: "diaria", comecaEm: brt("2026-10-03T00:00") });
    perto(valorNoPeriodo(diaria, P("2026-10-03T10:00", "2026-10-03T13:00"), TZ), 3);
    const semanal = manual({ valor: 168, frequencia: "semanal", comecaEm: brt("2026-10-03T00:00") });
    perto(valorNoPeriodo(semanal, P("2026-10-03T00:00", "2026-10-04T00:00"), TZ), 24);
    const unica = manual({ valor: 50, comecaEm: brt("2026-10-03T12:00") });
    expect(valorNoPeriodo(unica, P("2026-10-03T00:00", "2026-10-04T00:00"), TZ)).toBe(50);
    expect(valorNoPeriodo(unica, P("2026-10-03T12:01", "2026-10-04T00:00"), TZ)).toBe(0);
  });
});

describe("DRE do período", () => {
  const params = parametrosPadrao();
  const periodo = P("2026-10-03T00:00", "2026-10-04T00:00");
  const vendas = [
    vendaZenith({ brutoMxn: 149, aprovadaEm: brt("2026-10-03T10:00"), produto: "Fotos 149" }),
    vendaZenith({ brutoMxn: 199, aprovadaEm: brt("2026-10-03T11:00"), produto: "Fotos 199" }),
    vendaZenith({ brutoMxn: 99, aprovadaEm: brt("2026-10-03T12:00"), status: "pendente" }),
    // reembolsada: vendida 03/10, reembolsada 04/10 → receita em 03/10, linha negativa em 04/10
    vendaZenith({ brutoMxn: 99, aprovadaEm: brt("2026-10-03T08:00"), status: "reembolsada", reembolsadaEm: brt("2026-10-04T09:00") }),
    // histórica aprovada antes do marco zero: fora
    vendaZenith({ brutoMxn: 199, aprovadaEm: brt("2026-10-02T23:00"), historico: true }),
  ];
  const lancamentos = [
    metaLanc({ instante: brt("2026-10-03T10:00"), valor: 50 }),
    metaLanc({ instante: brt("2026-10-03T11:00"), valor: 30, conta: "act_210256430938513" }),
    iaLanc("kie", brt("2026-10-03T10:00"), 2),
    iaLanc("openai", brt("2026-10-03T10:00"), 1),
    metaLanc({ instante: brt("2026-10-02T10:00"), valor: 999, historico: true }), // fora
  ];
  const manuais = [
    zapdataManual(),
    manual({ valor: 10, comecaEm: brt("2026-10-03T13:00"), categoria: "contabilidade" }),
    manual({ valor: 4, tipo: "entrada", comecaEm: brt("2026-10-03T13:00"), categoria: "outros", descricao: "crédito Meta" }),
  ];
  const r = calcularDRE({ periodo, parametros: params, vendas, lancamentos, manuais, opcoes: opcoes() });

  it("receita: só aprovadas no período, pendente fora, reembolso negativo na data do reembolso", () => {
    // 03/10: três aprovadas (inclusive a que será reembolsada no dia seguinte); nenhum reembolso ainda
    perto(r.totais.receitaLiquida, vendas[0].liquidoBrl + vendas[1].liquidoBrl + vendas[3].liquidoBrl, 1e-9);
    expect(r.totais.numVendas).toBe(3);
    expect(r.totais.numReembolsos).toBe(0);
    expect(r.totais.pendentesQtd).toBe(1);
    perto(r.totais.pendentesValor, vendas[2].liquidoBrl, 1e-9);
    perto(r.totais.receitaBrutaMxn, 447);
    // 04/10: nenhuma venda, só a linha negativa do reembolso → o lucro de 03/10 não muda
    const dia4 = calcularDRE({ periodo: P("2026-10-04T00:00", "2026-10-05T00:00"), parametros: params, vendas, lancamentos: [], manuais: [], opcoes: opcoes() });
    expect(dia4.totais.numVendas).toBe(0);
    expect(dia4.totais.numReembolsos).toBe(1);
    perto(dia4.totais.receitaLiquida, -vendas[3].liquidoBrl, 1e-9);
  });

  it("custos: Meta com imposto, IA em BRL pelo câmbio do dia, ZapData diluído, operação", () => {
    perto(r.totais.metaExibido, 80);
    perto(r.totais.metaComImposto, 80 / 0.8785, 1e-9);
    perto(r.totais.ia, 3 * TAXA_USD, 1e-9);
    perto(r.totais.zapdata, 119 / 31, 1e-9);
    perto(r.totais.operacao, 10);
    perto(r.totais.entradasManuais, 4);
  });

  it("lucro bruto, imposto 8% sobre lucro bruto (0 se negativo) e lucro líquido", () => {
    const lb = r.totais.receitaLiquida - (r.totais.metaComImposto + r.totais.zapdata + r.totais.ia + r.totais.operacao) + 4;
    perto(r.totais.lucroBruto, lb, 1e-9);
    const imp = Math.max(0, lb) * 0.08;
    perto(r.totais.impostoLucro, imp, 1e-9);
    perto(r.totais.lucroLiquido, lb - imp, 1e-9);
    perto(r.totais.porSocio, (lb - imp) / 2, 1e-9);
  });

  it("linhas da DRE batem com os totais (cartões) centavo a centavo", () => {
    const linha = (c: string) => r.linhas.find((l) => l.chave === c)!.valor;
    const somaAteReceita = linha("receita_bruta") + linha("taxa_zenith_pct") + linha("taxa_zenith_fixa") + linha("cambio_zenith") + linha("reembolsos");
    perto(somaAteReceita, linha("receita_liquida"), 1e-9);
    const somaAteBruto = linha("receita_liquida") + linha("meta_exibido") + linha("meta_imposto") + linha("zapdata") + linha("ia") + linha("operacao") + linha("entradas_manuais");
    perto(somaAteBruto, linha("lucro_bruto"), 1e-9);
    perto(linha("lucro_bruto") + linha("imposto_lucro"), linha("lucro_liquido"), 1e-9);
    perto(linha("lucro_liquido"), r.totais.lucroLiquido, 1e-9);
    const ia = r.linhas.find((l) => l.chave === "ia")!;
    perto(ia.filhos!.reduce((a, f) => a + f.valor, 0), ia.valor, 1e-9);
  });

  it("indicadores", () => {
    perto(r.indicadores.roas!, r.totais.receitaLiquida / r.totais.metaComImposto, 1e-9);
    perto(r.indicadores.poas!, r.totais.lucroBruto / r.totais.metaComImposto, 1e-9);
    perto(r.indicadores.ticketMedioLiquido!, r.totais.receitaLiquida / 3, 1e-9);
    perto(r.indicadores.custoPorVenda!, r.totais.metaComImposto / 3, 1e-9);
    expect(r.indicadores.pontoEquilibrio).toBe(r.totais.lucroBruto >= 0 ? 0 : -r.totais.lucroBruto);
  });

  it("vendas por produto só com produto informado", () => {
    expect(r.porProduto).toHaveLength(2); // a terceira aprovada não tem produto
    expect(r.porProduto![0].produto).toBe("Fotos 199");
    const semProduto = calcularDRE({ periodo, parametros: params, vendas: [vendaZenith({ brutoMxn: 99, aprovadaEm: brt("2026-10-03T10:00") })], lancamentos: [], manuais: [], opcoes: opcoes() });
    expect(semProduto.porProduto).toBeNull();
    expect(semProduto.porProdutoIndisponivel).toMatch(/produto/);
  });

  it("interruptor 'Incluir lançamentos manuais' tira Operação e entradas, mantém ZapData", () => {
    const sem = calcularDRE({ periodo, parametros: params, vendas, lancamentos, manuais, opcoes: opcoes({ incluirManuais: false }) });
    expect(sem.totais.operacao).toBe(0);
    expect(sem.totais.entradasManuais).toBe(0);
    perto(sem.totais.zapdata, 119 / 31, 1e-9);
  });

  it("'Incluir histórico' traz vendas e gastos anteriores ao marco zero", () => {
    const pAmplo = P("2026-10-02T00:00", "2026-10-04T00:00");
    const sem = calcularDRE({ periodo: pAmplo, parametros: params, vendas, lancamentos, manuais, opcoes: opcoes() });
    const com = calcularDRE({ periodo: pAmplo, parametros: params, vendas, lancamentos, manuais, opcoes: opcoes({ incluirHistorico: true }) });
    expect(sem.totais.numVendas).toBe(3);
    expect(com.totais.numVendas).toBe(4); // + histórica aprovada 02/10
    perto(com.totais.metaExibido - sem.totais.metaExibido, 999);
  });

  it("base do imposto (a/b/c) muda só o imposto; imposto nunca negativo", () => {
    const mk = (base: string) => calcularDRE({ periodo, parametros: [...params.filter((p) => p.chave !== "imposto_lucro_base"), { chave: "imposto_lucro_base", valor: base, vigenciaInicio: brt("2026-09-01T00:00"), vigenciaFim: null }], vendas, lancamentos, manuais, opcoes: opcoes() });
    perto(mk("b").totais.impostoLucro, r.totais.receitaLiquida * 0.08, 1e-9);
    perto(mk("c").totais.impostoLucro, Math.max(0, r.totais.receitaLiquida - r.totais.metaComImposto) * 0.08, 1e-9);
    const prejuizo = calcularDRE({ periodo, parametros: params, vendas: [], lancamentos, manuais, opcoes: opcoes() });
    expect(prejuizo.totais.impostoLucro).toBe(0);
    expect(prejuizo.totais.lucroLiquido).toBeLessThan(0);
    expect(prejuizo.indicadores.pontoEquilibrio).toBeGreaterThan(0);
  });

  it("mudar alíquota hoje não altera o período de ontem", () => {
    const ontem = P("2026-10-03T00:00", "2026-10-04T00:00");
    const novos: Parametro[] = [
      ...params.filter((p) => p.chave !== "imposto_meta_pct"),
      { chave: "imposto_meta_pct", valor: "12.15", vigenciaInicio: brt("2026-09-01T00:00"), vigenciaFim: brt("2026-10-05T00:00") },
      { chave: "imposto_meta_pct", valor: "20", vigenciaInicio: brt("2026-10-05T00:00"), vigenciaFim: null },
    ];
    const antes = calcularDRE({ periodo: ontem, parametros: params, vendas, lancamentos, manuais, opcoes: opcoes() });
    const depois = calcularDRE({ periodo: ontem, parametros: novos, vendas, lancamentos, manuais, opcoes: opcoes() });
    perto(antes.totais.metaComImposto, depois.totais.metaComImposto, 1e-9);
    const dia5 = calcularDRE({ periodo: P("2026-10-05T00:00", "2026-10-06T00:00"), parametros: novos, vendas, lancamentos: [metaLanc({ instante: brt("2026-10-05T10:00"), valor: 80 })], manuais, opcoes: opcoes() });
    perto(dia5.totais.metaComImposto, 80 / 0.8, 1e-9);
  });
});
