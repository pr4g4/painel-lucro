/**
 * Camada de consulta: lê o banco e monta a entrada do motor de cálculo.
 * Uma única função (`calcularPeriodoComAnterior`) alimenta painel, DRE, gráfico e tabelas.
 */
import { and, asc, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, schema, executar } from "@/db";
import {
  calcularDRE, periodoAnterior, type Entrada, type Parametro, type Periodo, type VendaCalc, type LancamentoCalc,
  type ManualCalc, type CambioFn, type OpcoesCalculo, type ResultadoDRE,
} from "@/lib/calculo";
import { parametroVigente } from "@/lib/calculo";

const n = (x: string | number | null | undefined) => (x == null ? 0 : Number(x));

export async function carregarParametros(): Promise<Parametro[]> {
  const rows = await executar((d) => d.select().from(schema.parametros).orderBy(asc(schema.parametros.vigenciaInicio)), 8000, "parâmetros");
  return rows.map((r) => ({ chave: r.chave, valor: r.valor, vigenciaInicio: r.vigenciaInicio, vigenciaFim: r.vigenciaFim }));
}

export async function marcoZero(params?: Parametro[]): Promise<Date> {
  const ps = params ?? (await carregarParametros());
  const p = parametroVigente(ps, "marco_zero", new Date());
  return p ? new Date(p.valor) : new Date("2026-10-03T03:00:00Z");
}

/** Monta a função de câmbio: taxa do dia; sem taxa no dia, usa a última anterior (fim de semana/feriado). */
export async function carregarCambio(): Promise<CambioFn> {
  const rows = await executar((d) => d.select().from(schema.cambio).orderBy(asc(schema.cambio.dia)), 8000, "câmbio");
  const porPar = new Map<string, { dia: string; taxa: number }[]>();
  for (const r of rows) {
    const arr = porPar.get(r.par) ?? [];
    arr.push({ dia: r.dia, taxa: Number(r.taxa) });
    porPar.set(r.par, arr);
  }
  return (par, dia) => {
    const arr = porPar.get(par);
    if (!arr?.length) return null;
    const alvo = diaBrasilia(dia);
    let melhor: number | null = null;
    for (const x of arr) { if (x.dia <= alvo) melhor = x.taxa; else break; }
    return melhor ?? arr[0].taxa; // antes do primeiro registro, usa o primeiro conhecido
  };
}

export function diaBrasilia(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TZ ?? "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export async function carregarVendas(janela: Periodo): Promise<VendaCalc[]> {
  // Traz aprovadas/reembolsadas que tocam a janela e todas as pendentes (são poucas e informativas)
  const rows = await executar((d) => d.select().from(schema.vendas).where(or(
    and(gte(schema.vendas.aprovadaEm, janela.inicio), lt(schema.vendas.aprovadaEm, janela.fim)),
    and(gte(schema.vendas.reembolsadaEm, janela.inicio), lt(schema.vendas.reembolsadaEm, janela.fim)),
    eq(schema.vendas.status, "pendente"),
    // reserva retida: aprovadas antes da janela e ainda não liberadas
    and(eq(schema.vendas.status, "aprovada"), isNull(schema.vendas.reservaLiberadaEm), lt(schema.vendas.aprovadaEm, janela.fim)),
  )), 10000, "vendas");
  return rows.map((r) => ({
    id: r.id, fonte: r.fonte, idOrigem: r.idOrigem, status: r.status, criadaEm: r.criadaEm, aprovadaEm: r.aprovadaEm,
    reembolsadaEm: r.reembolsadaEm, produto: r.produto, moeda: r.moeda, brutoOriginal: n(r.brutoOriginal), taxaCambio: n(r.taxaCambio),
    brutoBrl: n(r.brutoBrl), taxaPctBrl: n(r.taxaPctBrl), taxaFixaBrl: n(r.taxaFixaBrl), cambioPctBrl: n(r.cambioPctBrl),
    liquidoBrl: n(r.liquidoBrl), reservaBrl: n(r.reservaBrl), reservaLiberadaEm: r.reservaLiberadaEm, historico: r.historico,
  }));
}

export async function carregarLancamentos(janela: Periodo): Promise<LancamentoCalc[]> {
  const rows = await executar((d) => d.select({ l: schema.lancamentos, frente: schema.frentes.nome })
    .from(schema.lancamentos)
    .leftJoin(schema.campanhas, and(eq(schema.campanhas.contaId, schema.lancamentos.contaId), eq(schema.campanhas.campanhaId, schema.lancamentos.campanhaId)))
    .leftJoin(schema.frentes, eq(schema.frentes.id, schema.campanhas.frenteId))
    .where(and(gte(schema.lancamentos.instante, janela.inicio), lt(schema.lancamentos.instante, janela.fim))), 10000, "lançamentos");
  return rows.map(({ l, frente }) => ({
    id: l.id, fonte: l.fonte, tipo: l.tipo, instante: l.instante, granularidade: l.granularidade, descricao: l.descricao,
    valorBrl: n(l.valorBrl), valorOriginal: n(l.valorOriginal), moeda: l.moeda, contaId: l.contaId, campanhaId: l.campanhaId,
    modelo: l.modelo, frente, historico: l.historico, estimado: l.estimado,
  }));
}

export async function carregarManuais(): Promise<ManualCalc[]> {
  const rows = await executar((d) => d.select({ m: schema.lancamentosManuais, cat: schema.categorias })
    .from(schema.lancamentosManuais).leftJoin(schema.categorias, eq(schema.categorias.id, schema.lancamentosManuais.categoriaId)), 8000, "lançamentos manuais");
  return rows.map(({ m, cat }) => ({
    id: m.id, tipo: m.tipo, moeda: m.moeda, valor: n(m.valor), categoria: cat?.nome ?? "sem categoria", linhaDre: cat?.linhaDre ?? "operacao",
    descricao: m.descricao, frequencia: m.frequencia, comecaEm: m.comecaEm, terminaEm: m.terminaEm, ativo: m.ativo,
  }));
}

export type OpcoesConsulta = Omit<OpcoesCalculo, "cambio" | "marcoZero">;

export async function montarEntrada(periodo: Periodo, op: OpcoesConsulta): Promise<Entrada> {
  const parametros = await carregarParametros();
  const [vendas, lancamentos, manuais, cambio, mz] = await Promise.all([
    carregarVendas(periodo), carregarLancamentos(periodo), carregarManuais(), carregarCambio(), marcoZero(parametros),
  ]);
  return { periodo, parametros, vendas, lancamentos, manuais, opcoes: { ...op, cambio, marcoZero: mz } };
}

export async function calcularPeriodoComAnterior(periodo: Periodo, op: OpcoesConsulta): Promise<{ atual: ResultadoDRE; anterior: ResultadoDRE; temBaseAnterior: boolean }> {
  const ant = periodoAnterior(periodo, op.tz);
  const [ea, eb] = await Promise.all([montarEntrada(periodo, op), montarEntrada(ant, op)]);
  const atual = calcularDRE(ea);
  const anterior = calcularDRE(eb);
  const temBaseAnterior = eb.vendas.length + eb.lancamentos.length > 0 || anterior.totais.custosTotais > 0;
  return { atual, anterior, temBaseAnterior };
}

/** Última coleta por fonte, para o carimbo "atualizado às": uma linha por fonte, agregada no banco. */
export type EstadoColeta = { ultimaOk: Date | null; ultima: Date; erro: string | null; falhasSeguidas: number; naoConfigurada: boolean };
export async function ultimasColetas(): Promise<Map<string, EstadoColeta>> {
  const rows = await executar((d) => d.execute(sql`
    with ult_ok as (select fonte, max(coalesce(terminada_em, iniciada_em)) as ultima_ok from coletas where ok group by fonte)
    select c.fonte,
           max(c.iniciada_em) as ultima,
           u.ultima_ok,
           count(*) filter (where c.ok = false and c.iniciada_em > coalesce(u.ultima_ok, '1970-01-01'))::int as falhas_seguidas,
           (array_agg(c.erro order by c.iniciada_em desc) filter (where c.ok = false and c.iniciada_em > coalesce(u.ultima_ok, '1970-01-01')))[1] as erro
    from coletas c left join ult_ok u on u.fonte = c.fonte
    group by c.fonte, u.ultima_ok`), 8000, "coletas") as unknown as { fonte: string; ultima: string | Date; ultima_ok: string | Date | null; falhas_seguidas: number; erro: string | null }[];
  const m = new Map<string, EstadoColeta>();
  for (const r of rows) m.set(r.fonte, { ultima: new Date(r.ultima), ultimaOk: r.ultima_ok ? new Date(r.ultima_ok) : null, erro: r.erro, falhasSeguidas: r.falhas_seguidas, naoConfigurada: /não configurada/.test(r.erro ?? "") });
  return m;
}

export async function avisosAbertos() {
  return executar((d) => d.select().from(schema.avisos).where(isNull(schema.avisos.resolvidoEm)).orderBy(desc(schema.avisos.criadoEm)).limit(100), 8000, "avisos");
}

/** Entrada ampla (uma leitura só) para calcular vários períodos: parâmetros, vendas, lançamentos, manuais e câmbio em paralelo. */
export async function montarEntradaAmpla(janela: Periodo, op: OpcoesConsulta, problemas: string[]): Promise<Entrada> {
  const seguro = async <T,>(p: Promise<T>, padrao: T, rotulo: string): Promise<T> => {
    try { return await p; } catch (e) { problemas.push(`${rotulo}: dado indisponível (${e instanceof Error ? e.message : String(e)})`); return padrao; }
  };
  const [parametros, vendas, lancamentos, manuais, cambio] = await Promise.all([
    seguro(carregarParametros(), [] as Parametro[], "parâmetros"),
    seguro(carregarVendas(janela), [] as VendaCalc[], "vendas"),
    seguro(carregarLancamentos(janela), [] as LancamentoCalc[], "lançamentos"),
    seguro(carregarManuais(), [] as ManualCalc[], "lançamentos manuais"),
    seguro(carregarCambio(), (() => null) as CambioFn, "câmbio"),
  ]);
  const mz = parametroVigente(parametros, "marco_zero", new Date());
  return { periodo: janela, parametros, vendas, lancamentos, manuais, opcoes: { ...op, cambio, marcoZero: mz ? new Date(mz.valor) : new Date("2026-10-03T03:00:00Z") } };
}

export { lte, db };
