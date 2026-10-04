import type { Entrada, LinhaDRE, ResultadoDRE, VendaCalc, LancamentoCalc, Periodo } from "./tipos";
import { numeroVigente, textoVigente, fatorImpostoMeta } from "./parametros";
import { dentro } from "./periodo";
import { valorBrlNoPeriodo } from "./recorrentes";

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const div = (a: number, b: number) => (b === 0 ? null : a / b);

/**
 * Calcula a DRE e os indicadores de um período. Função pura: mesma entrada, mesma saída.
 * Os cartões do painel e a tabela da DRE usam ESTA função, por isso batem centavo a centavo.
 */
export function calcularDRE(e: Entrada): ResultadoDRE {
  const { periodo: p, parametros: params, opcoes: op } = e;
  const avisos: string[] = [];
  const marco = op.marcoZero.getTime();
  const conta = (historico: boolean) => op.incluirHistorico || !historico;

  // ---------- Receita (vendas aprovadas no período) ----------
  const aprovadasNoPeriodo = e.vendas.filter(
    (v) => conta(v.historico) && v.aprovadaEm && dentro(v.aprovadaEm, p) && v.status !== "pendente" && v.status !== "cancelada",
  );
  const receitaBrutaMxn = soma(aprovadasNoPeriodo.filter((v) => v.moeda === "MXN").map((v) => v.brutoOriginal));
  const receitaBrutaBrl = soma(aprovadasNoPeriodo.map((v) => v.brutoBrl));
  const taxaZenithPct = soma(aprovadasNoPeriodo.map((v) => v.taxaPctBrl));
  const taxaZenithFixa = soma(aprovadasNoPeriodo.map((v) => v.taxaFixaBrl));
  const cambioZenith = soma(aprovadasNoPeriodo.map((v) => v.cambioPctBrl));

  // Reembolsos/chargebacks: linha negativa na data do reembolso (decisão do Erick, seção 12.3)
  const reembolsadasNoPeriodo = e.vendas.filter(
    (v) => conta(v.historico) && (v.status === "reembolsada" || v.status === "chargeback") && dentro(v.reembolsadaEm, p),
  );
  const reembolsos = soma(reembolsadasNoPeriodo.map((v) => v.liquidoBrl));

  const receitaLiquida = receitaBrutaBrl - taxaZenithPct - taxaZenithFixa - cambioZenith - reembolsos;

  // Conferência: o líquido vindo da fonte tem de bater com bruto − deduções.
  const liquidoFonte = soma(aprovadasNoPeriodo.map((v) => v.liquidoBrl));
  if (Math.abs(liquidoFonte - (receitaBrutaBrl - taxaZenithPct - taxaZenithFixa - cambioZenith)) > 0.01) {
    avisos.push(`Líquido informado pela fonte (${liquidoFonte.toFixed(2)}) difere de bruto − deduções.`);
  }

  // Reserva retida (informativa, só de venda nova): aprovada desde o marco zero e ainda não liberada
  const reservaRetida = soma(
    e.vendas
      .filter((v) => v.fonte !== "manual" && v.aprovadaEm && v.aprovadaEm.getTime() >= marco && v.aprovadaEm < p.fim && !v.reservaLiberadaEm && v.status === "aprovada")
      .map((v) => v.reservaBrl),
  );

  // Pendentes (informativo, fora da receita): criadas até o fim do período e ainda pendentes
  const pendentes = e.vendas.filter((v) => conta(v.historico) && v.status === "pendente" && (!v.criadaEm || v.criadaEm < p.fim));
  const pendentesValor = soma(pendentes.map((v) => v.liquidoBrl));

  // ---------- Meta ----------
  const meta = e.lancamentos.filter((l) => l.fonte === "meta" && conta(l.historico) && dentro(l.instante, p));
  const metaExibido = soma(meta.map((l) => l.valorBrl));
  const metaComImposto = soma(meta.map((l) => l.valorBrl * fatorImpostoMeta(numeroVigente(params, "imposto_meta_pct", l.instante))));
  const metaImposto = metaComImposto - metaExibido;

  const metaPorConta = agrupar(meta, (l) => l.contaId ?? "sem conta", (l) => l.valorBrl * fatorImpostoMeta(numeroVigente(params, "imposto_meta_pct", l.instante)));
  const metaPorFrente = agrupar(meta, (l) => l.frente ?? "sem frente", (l) => l.valorBrl * fatorImpostoMeta(numeroVigente(params, "imposto_meta_pct", l.instante)));

  // ---------- IA ----------
  const ia = e.lancamentos.filter((l) => (l.fonte === "openai" || l.fonte === "kie") && l.tipo === "uso_ia" && conta(l.historico) && dentro(l.instante, p));
  const iaKie = soma(ia.filter((l) => l.fonte === "kie").map((l) => l.valorBrl));
  const iaOpenai = soma(ia.filter((l) => l.fonte === "openai").map((l) => l.valorBrl));

  // ---------- Manuais (ZapData, IA manual, Operação, entradas) ----------
  const manuaisAtivos = e.manuais.filter((m) => m.ativo && (op.incluirHistorico || m.comecaEm.getTime() >= marco || m.frequencia !== "unica"));
  type Item = { m: typeof manuaisAtivos[number]; brl: number };
  const itens: Item[] = [];
  for (const m of manuaisAtivos) {
    const r = valorBrlNoPeriodo(m, p, op.tz, op.cambio);
    if (r.indisponivel) { avisos.push(`Lançamento manual "${m.descricao}": ${r.indisponivel}`); continue; }
    if (r.brl !== 0) itens.push({ m, brl: r.brl });
  }
  const zapdata = soma(itens.filter((i) => i.m.tipo === "saida" && i.m.linhaDre === "zapdata").map((i) => i.brl));
  const iaManual = soma(itens.filter((i) => i.m.tipo === "saida" && i.m.linhaDre === "ia").map((i) => i.brl));
  const operacaoItens = op.incluirManuais ? itens.filter((i) => i.m.tipo === "saida" && i.m.linhaDre === "operacao") : [];
  const operacao = soma(operacaoItens.map((i) => i.brl));
  const operacaoPorCategoria = agrupar(operacaoItens, (i) => i.m.categoria, (i) => i.brl);
  const entradasItens = op.incluirManuais ? itens.filter((i) => i.m.tipo === "entrada") : [];
  const entradasManuais = soma(entradasItens.map((i) => i.brl));

  const iaTotal = iaKie + iaOpenai + iaManual;

  // ---------- Lucro ----------
  const custosTotais = metaComImposto + zapdata + iaTotal + operacao;
  const lucroBruto = receitaLiquida - custosTotais + entradasManuais;

  // Imposto sobre lucro: parâmetro vigente no FIM do período (período fechado usa a regra daquele momento)
  const refImposto = new Date(Math.min(p.fim.getTime() - 1, Date.now()));
  const impostoPct = numeroVigente(params, "imposto_lucro_pct", refImposto, 8);
  const base = textoVigente(params, "imposto_lucro_base", refImposto, "a");
  const baseValor = base === "b" ? receitaLiquida : base === "c" ? receitaLiquida - metaComImposto : lucroBruto;
  const impostoLucro = Math.max(0, baseValor) * (impostoPct / 100);
  const lucroLiquido = lucroBruto - impostoLucro;

  const numVendas = aprovadasNoPeriodo.length;

  // ---------- Por produto ----------
  const comProduto = aprovadasNoPeriodo.filter((v) => v.produto);
  let porProduto: ResultadoDRE["porProduto"] = null;
  let porProdutoIndisponivel: string | undefined;
  if (numVendas === 0) porProdutoIndisponivel = "sem vendas no período";
  else if (comProduto.length === 0) porProdutoIndisponivel = "a fonte não informou o produto das vendas";
  else {
    const g = new Map<string, { qtd: number; receita: number }>();
    for (const v of comProduto) {
      const cur = g.get(v.produto!) ?? { qtd: 0, receita: 0 };
      cur.qtd++; cur.receita += v.liquidoBrl; g.set(v.produto!, cur);
    }
    porProduto = [...g.entries()].map(([produto, x]) => ({ produto, qtd: x.qtd, receitaLiquida: x.receita, ticketMedio: x.receita / x.qtd }))
      .sort((a, b) => b.receitaLiquida - a.receitaLiquida);
    if (comProduto.length < numVendas) avisos.push(`${numVendas - comProduto.length} venda(s) sem produto informado ficaram fora de "Vendas por produto".`);
  }

  // ---------- Linhas da DRE ----------
  const L = (chave: string, rotulo: string, valor: number, nivel: LinhaDRE["nivel"], extra?: Partial<LinhaDRE>): LinhaDRE => ({ chave, rotulo, valor, nivel, ...extra });
  const filhos = (m: Map<string, number>, prefixo: string) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => L(`${prefixo}:${k}`, k, -v, 2));

  const linhas: LinhaDRE[] = [
    L("receita_bruta", "Receita bruta", receitaBrutaBrl, 1, { extra: { mxn: receitaBrutaMxn, vendas: numVendas } }),
    L("taxa_zenith_pct", "(−) Taxa Zenith %", -taxaZenithPct, 1),
    L("taxa_zenith_fixa", "(−) Taxa fixa", -taxaZenithFixa, 1),
    L("cambio_zenith", "(−) Câmbio Zenith", -cambioZenith, 1),
    L("reembolsos", "(−) Reembolsos / chargebacks", -reembolsos, 1, { extra: { qtd: reembolsadasNoPeriodo.length } }),
    L("receita_liquida", "Receita líquida", receitaLiquida, 0, { destaque: true }),
    L("meta_exibido", "(−) Meta exibido", -metaExibido, 1, {
      filhos: [
        ...filhos(agrupar(meta, (l) => l.contaId ?? "sem conta", (l) => l.valorBrl), "meta_conta_exibido"),
      ],
    }),
    L("meta_imposto", "(−) Imposto Meta", -metaImposto, 1),
    L("meta_com_imposto", "Meta com imposto (soma das duas acima)", -metaComImposto, 2, {
      informativo: true,
      filhos: [...filhos(metaPorConta, "meta_conta"), ...filhos(metaPorFrente, "meta_frente")],
    }),
    L("zapdata", "(−) ZapData diluído", -zapdata, 1),
    L("ia", "(−) IA", -iaTotal, 1, {
      filhos: [L("ia:kie", "kie.ai", -iaKie, 2), L("ia:openai", "OpenAI", -iaOpenai, 2), ...(iaManual ? [L("ia:manual", "IA (manual)", -iaManual, 2)] : [])],
    }),
    L("operacao", "(−) Operação", -operacao, 1, { filhos: filhos(operacaoPorCategoria, "operacao") }),
    L("entradas_manuais", "(+) Entradas manuais", entradasManuais, 1),
    L("lucro_bruto", "Lucro bruto", lucroBruto, 0, { destaque: true }),
    L("imposto_lucro", `(−) Imposto sobre lucro (${impostoPct}% da base ${base})`, -impostoLucro, 1),
    L("lucro_liquido", "Lucro líquido", lucroLiquido, 0, { destaque: true }),
    L("por_socio", "Metade para cada sócio", lucroLiquido / 2, 1),
    L("reserva_retida", "Reserva retida na Zenith (informativo)", reservaRetida, 1, { informativo: true }),
    L("pendentes", "Vendas pendentes (informativo)", pendentesValor, 1, { informativo: true, extra: { qtd: pendentes.length } }),
  ];

  return {
    periodo: p,
    linhas,
    totais: {
      receitaBrutaMxn, receitaBrutaBrl, taxaZenithPct, taxaZenithFixa, cambioZenith, reembolsos, receitaLiquida,
      metaExibido, metaImposto, metaComImposto, zapdata, ia: iaTotal, iaKie, iaOpenai, operacao, entradasManuais,
      custosTotais, lucroBruto, impostoLucro, lucroLiquido, porSocio: lucroLiquido / 2,
      reservaRetida, pendentesQtd: pendentes.length, pendentesValor, numVendas, numReembolsos: reembolsadasNoPeriodo.length,
    },
    indicadores: {
      roas: receitaLiquida > 0 ? div(receitaLiquida, metaComImposto) : null,
      poas: div(lucroBruto, metaComImposto),
      margemLiquida: div(lucroLiquido, receitaLiquida),
      custoPorVenda: div(metaComImposto, numVendas),
      ticketMedioLiquido: div(receitaLiquida, numVendas),
      pontoEquilibrio: Math.max(0, -lucroBruto),
    },
    porProduto,
    porProdutoIndisponivel,
    avisos,
  };
}

function agrupar<T>(xs: T[], chave: (x: T) => string, valor: (x: T) => number): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(chave(x), (m.get(chave(x)) ?? 0) + valor(x));
  return m;
}

/** Variação entre atual e anterior: valor absoluto e percentual (null sem base). */
export function variacao(atual: number, anterior: number | null | undefined): { abs: number | null; pct: number | null } {
  if (anterior == null) return { abs: null, pct: null };
  const abs = atual - anterior;
  return { abs, pct: anterior === 0 ? null : abs / Math.abs(anterior) };
}

/** Arredonda para centavos só na exibição. */
export const centavos = (n: number) => Math.round(n * 100) / 100;

export type { Periodo, VendaCalc, LancamentoCalc };
