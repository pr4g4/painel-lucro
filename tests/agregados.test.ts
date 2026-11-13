import { describe, it, expect, beforeAll } from "vitest";

/**
 * 13/11: o cálculo passou a receber vendas e lançamentos AGREGADOS (uma linha = várias iguais). Este teste prova que o resultado
 * é o mesmo do cálculo linha a linha, para os períodos que a inicial mostra (hoje, ontem, 7 dias, desde o marco zero).
 */
describe.skipIf(!process.env.DATABASE_URL)("agregados = linha a linha (banco local com dados de exemplo)", () => {
  let dados: typeof import("../src/lib/dados"); let calc: typeof import("../src/lib/calculo"); let ctxm: typeof import("../src/lib/contexto"); let ag: typeof import("../src/lib/agregados");
  beforeAll(async () => { dados = await import("../src/lib/dados"); calc = await import("../src/lib/calculo"); ctxm = await import("../src/lib/contexto"); ag = await import("../src/lib/agregados"); });
  // mesma montagem de montarEntradaAmpla, sem o cache do Next (que só existe dentro do servidor)
  const ampla_ = async (p: { inicio: Date; fim: Date }, op: { tz: string; incluirHistorico: boolean; incluirManuais: boolean }) => {
    const j = dados.janelaUnica(p);
    const [parametros, v, l, manuais, cambio] = await Promise.all([dados.carregarParametros(), ag.vendasAgregadas(j.inicio, j.fim), ag.lancamentosAgregados(j.inicio, j.fim), dados.carregarManuais(), dados.carregarCambio()]);
    return { periodo: j, parametros, vendas: ag.paraVendasCalc(v), lancamentos: ag.paraLancamentosCalc(l), manuais, opcoes: { ...op, cambio, marcoZero: new Date("2026-10-03T03:00:00Z") } };
  };
  const tz = "America/Sao_Paulo";
  for (const atalho of ["hoje", "ontem", "7_dias", "marco_zero"] as const) {
    it(`período ${atalho}: totais e funil iguais`, async () => {
      const agora = new Date();
      const p = calc.resolverAtalho(atalho, agora, new Date("2026-10-03T03:00:00Z"), tz).periodo;
      const op = { tz, incluirHistorico: false, incluirManuais: true };
      const bruta = { ...(await dados.montarEntrada(p, op)), opcoes: { ...(await dados.montarEntrada(p, op)).opcoes, marcoZero: new Date("2026-10-03T03:00:00Z") } };
      const ampla = await ampla_(p, op);
      const a = calc.calcularDRE({ ...bruta, periodo: p }).totais, b = calc.calcularDRE({ ...ampla, periodo: p }).totais;
      for (const k of ["receitaLiquida", "receitaBrutaBrl", "reembolsos", "metaComImposto", "tiktokComImposto", "ia", "zapdata", "operacao", "lucroBruto", "impostoLucro", "lucroLiquido", "numVendas", "numReembolsos", "pendentesQtd", "pendentesValor", "reservaRetida"] as const) {
        expect(b[k], k).toBeCloseTo(a[k], 6);
      }
      // funil pela entrada bruta × pela agregada
      const fa = ctxm.funilDoPeriodo(bruta, p, false), fb = ctxm.funilDoPeriodo(ampla, p, false);
      expect(fb).toEqual(fa);
      expect(fa.aprovadas).toBe(a.numVendas);
      // gráfico acumulado: mesmo último ponto
      const ga = calc.lucroAcumulado(bruta, p, tz), gb = calc.lucroAcumulado(ampla, p, tz);
      expect(gb.pontos.length).toBe(ga.pontos.length);
      if (ga.pontos.length) expect(gb.pontos.at(-1)!.acumulado).toBeCloseTo(ga.pontos.at(-1)!.acumulado, 6);
      // o que importa para o consumo: a janela agregada (marco zero até agora) tem poucas linhas
      expect(ampla.vendas.length + ampla.lancamentos.length).toBeLessThan(600);
      console.log(`${atalho}: linhas brutas ${bruta.vendas.length}+${bruta.lancamentos.length} → agregadas ${ampla.vendas.length}+${ampla.lancamentos.length}`);
    });
  }
});
