/**
 * Teste de sanidade (seção 11): o motor reproduz os números já conferidos de 02/10/2026 a partir de dados de exemplo
 * com a mesma forma que os coletores vão gravar. Valida o motor, não as fontes (isso só com chave real).
 */
import { describe, it, expect } from "vitest";
import { calcularDRE, type Periodo } from "../src/lib/calculo";
import { brt, parametrosPadrao, metaLanc, iaLanc, vendaZenithPorLiquido, zapdataManual, opcoes, TAXA_USD } from "./fixtures";

const P = (a: string, b: string): Periodo => ({ inicio: brt(a), fim: brt(b) });
const params = parametrosPadrao();
const perto = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("sanidade 02/10/2026 (dados de exemplo com a forma dos coletores)", () => {
  it("Meta contas 00 + 01: R$ 315,29 exibidos → R$ 358,89 com imposto", () => {
    // 24 horas da conta 00 somando 200,00 e 24 horas da conta 01 somando 115,29
    const lanc = [];
    for (let h = 0; h < 24; h++) {
      lanc.push(metaLanc({ instante: brt(`2026-10-02T${String(h).padStart(2, "0")}:00`), valor: 200 / 24, conta: "act_240727500555671", historico: true }));
      lanc.push(metaLanc({ instante: brt(`2026-10-02T${String(h).padStart(2, "0")}:00`), valor: 115.29 / 24, conta: "act_210256430938513", campanha: "c2", historico: true }));
    }
    const r = calcularDRE({ periodo: P("2026-10-02T00:00", "2026-10-03T00:00"), parametros: params, vendas: [], lancamentos: lanc, manuais: [], opcoes: opcoes({ incluirHistorico: true }) });
    perto(r.totais.metaExibido, 315.29, 0.005);
    perto(r.totais.metaComImposto, 358.89, 0.01);
  });

  it("kie.ai US$ 16,65 e OpenAI US$ 7,30 (bucket UTC) em 02/10", () => {
    const lanc = [
      ...[5.55, 5.55, 5.55].map((v, i) => iaLanc("kie", brt(`2026-10-02T${String(8 + i).padStart(2, "0")}:00`), v, true)),
      ...[3.65, 3.65].map((v, i) => iaLanc("openai", new Date(`2026-10-02T${10 + i}:00:00Z`), v, true)),
    ];
    const r = calcularDRE({ periodo: P("2026-10-02T00:00", "2026-10-03T00:00"), parametros: params, vendas: [], lancamentos: lanc, manuais: [], opcoes: opcoes({ incluirHistorico: true }) });
    perto(r.totais.iaKie, 16.65 * TAXA_USD, 0.005);
    perto(r.totais.iaOpenai, 7.30 * TAXA_USD, 0.005);
  });

  it("histórico 12/09–02/10: Meta com imposto R$ 3.550,55 e receita líquida Zenith (45 vendas) R$ 1.545,30", () => {
    const lanc = [];
    const exibidoTotal = 3550.55 * (1 - 0.1215);
    for (let d = 0; d < 21; d++) {
      const dia = new Date(brt("2026-09-12T00:00").getTime() + d * 86_400_000);
      lanc.push(metaLanc({ instante: dia, valor: exibidoTotal / 21, historico: true }));
    }
    const vendas = Array.from({ length: 45 }, (_, i) => vendaZenithPorLiquido(1545.30 / 45, new Date(brt("2026-09-12T12:00").getTime() + i * 11 * 3_600_000), true));
    const r = calcularDRE({ periodo: P("2026-09-12T00:00", "2026-10-03T00:00"), parametros: params, vendas, lancamentos: lanc, manuais: [], opcoes: opcoes({ incluirHistorico: true }) });
    perto(r.totais.metaComImposto, 3550.55, 0.01);
    expect(r.totais.numVendas).toBe(45);
    perto(r.totais.receitaLiquida, 1545.30, 0.01);
    expect(r.avisos.filter((a) => a.includes("difere"))).toHaveLength(0);
  });

  it("ZapData: regra da fórmula 4 dá R$ 119 ÷ 31 por dia em outubro; o R$ 126,68 do histórico equivale a 33 dias nessa taxa", () => {
    // Pela fórmula 4 (ciclo dia 2 → dia 1), 12/09–02/10 daria 20 dias × 119/30 + 1 dia × 119/31 = 83,17, não 126,68.
    // 126,68 = 33 × 119 ÷ 31 (ex.: 31/08–02/10). Registrado em docs/pendencias.md para o Erick confirmar a janela.
    perto(33 * 119 / 31, 126.68, 0.005);
    const zapSet = zapdataManual(brt("2026-09-02T00:00"));
    const r = calcularDRE({ periodo: P("2026-09-12T00:00", "2026-10-03T00:00"), parametros: params, vendas: [], lancamentos: [], manuais: [zapSet], opcoes: opcoes({ incluirHistorico: true }) });
    perto(r.totais.zapdata, 20 * 119 / 30 + 119 / 31, 0.005);
  });
});
