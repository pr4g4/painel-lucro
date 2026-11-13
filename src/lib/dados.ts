/**
 * Camada de consulta: lê o banco e monta a entrada do motor de cálculo.
 * Uma única função (`calcularPeriodoComAnterior`) alimenta painel, DRE, gráfico e tabelas.
 */
import { and, asc, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, schema, executar } from "@/db";
import { unstable_cache } from "next/cache";
import { lembrar } from "@/lib/memoria";
import { vendasAgregadas, lancamentosAgregados, paraVendasCalc, paraLancamentosCalc } from "@/lib/agregados";
export const TAG_DADOS = "dados";
const MARCO_PADRAO = new Date("2026-10-03T03:00:00Z");
import {
  calcularDRE, periodoAnterior, type Entrada, type Parametro, type Periodo, type VendaCalc, type LancamentoCalc,
  type ManualCalc, type CambioFn, type OpcoesCalculo, type ResultadoDRE,
} from "@/lib/calculo";
import { parametroVigente } from "@/lib/calculo";

const n = (x: string | number | null | undefined) => (x == null ? 0 : Number(x));

export async function carregarParametros(): Promise<Parametro[]> {
  const rows = await executar((d) => d.select().from(schema.parametros).orderBy(asc(schema.parametros.vigenciaInicio)), PRAZO_PAGINA_MS, "parâmetros");
  return rows.map((r) => ({ id: r.id, chave: r.chave, valor: r.valor, vigenciaInicio: r.vigenciaInicio, vigenciaFim: r.vigenciaFim }));
}

export async function marcoZero(params?: Parametro[]): Promise<Date> {
  const ps = params ?? (await carregarParametros());
  const p = parametroVigente(ps, "marco_zero", new Date());
  return p ? new Date(p.valor) : new Date("2026-10-03T03:00:00Z");
}

/** Monta a função de câmbio: taxa do dia; sem taxa no dia, usa a última anterior (fim de semana/feriado). */
export async function carregarCambio(): Promise<CambioFn> {
  const rows = await executar((d) => d.select().from(schema.cambio).orderBy(asc(schema.cambio.dia)), PRAZO_PAGINA_MS, "câmbio");
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
  // sem a coluna payload (o evento bruto da Zenith, o maior campo da tabela): só o método, extraído no banco. 10/11: saída de rede do Supabase estourada.
  const rows = await executar((d) => d.select({ ...COLUNAS_VENDA, metodo: sql<string | null>`coalesce(${schema.vendas.payload}->>'metodo_pagamento', ${schema.vendas.payload}->>'metodo', ${schema.vendas.payload}->'data'->>'paymentMethod', ${schema.vendas.payload}->'data'->>'method')` }).from(schema.vendas).where(or(
    and(gte(schema.vendas.aprovadaEm, janela.inicio), lt(schema.vendas.aprovadaEm, janela.fim)),
    and(gte(schema.vendas.reembolsadaEm, janela.inicio), lt(schema.vendas.reembolsadaEm, janela.fim)),
    and(eq(schema.vendas.status, "pendente"), gte(schema.vendas.criadaEm, new Date(janela.inicio.getTime() - 7 * 86_400_000))),
    // reserva retida: aprovadas desde o marco zero, antes do fim da janela e ainda não liberadas
    and(eq(schema.vendas.status, "aprovada"), isNull(schema.vendas.reservaLiberadaEm), gte(schema.vendas.aprovadaEm, MARCO_PADRAO), lt(schema.vendas.aprovadaEm, janela.fim)),
  )), 10000, "vendas");
  return rows.map((r) => ({
    id: r.id, fonte: r.fonte, idOrigem: r.idOrigem, status: r.status, criadaEm: r.criadaEm, aprovadaEm: r.aprovadaEm,
    reembolsadaEm: r.reembolsadaEm, produto: r.produto, moeda: r.moeda, brutoOriginal: n(r.brutoOriginal), taxaCambio: n(r.taxaCambio),
    brutoBrl: n(r.brutoBrl), taxaPctBrl: n(r.taxaPctBrl), taxaFixaBrl: n(r.taxaFixaBrl), cambioPctBrl: n(r.cambioPctBrl),
    liquidoBrl: n(r.liquidoBrl), reservaBrl: n(r.reservaBrl), reservaLiberadaEm: r.reservaLiberadaEm, historico: r.historico,
    metodo: r.metodo ?? null,
  }));
}
const v = schema.vendas;
const COLUNAS_VENDA = { id: v.id, fonte: v.fonte, idOrigem: v.idOrigem, status: v.status, criadaEm: v.criadaEm, aprovadaEm: v.aprovadaEm, reembolsadaEm: v.reembolsadaEm, produto: v.produto, moeda: v.moeda, brutoOriginal: v.brutoOriginal, taxaCambio: v.taxaCambio, brutoBrl: v.brutoBrl, taxaPctBrl: v.taxaPctBrl, taxaFixaBrl: v.taxaFixaBrl, cambioPctBrl: v.cambioPctBrl, liquidoBrl: v.liquidoBrl, reservaBrl: v.reservaBrl, reservaLiberadaEm: v.reservaLiberadaEm, historico: v.historico };
const l = schema.lancamentos;
/** Só o que o cálculo usa: sem payload (linha bruta da Meta, centenas de bytes por hora de campanha), chave natural e datas de coleta. */
const COLUNAS_LANCAMENTO = { id: l.id, fonte: l.fonte, tipo: l.tipo, instante: l.instante, granularidade: l.granularidade, descricao: l.descricao, valorBrl: l.valorBrl, valorOriginal: l.valorOriginal, moeda: l.moeda, contaId: l.contaId, campanhaId: l.campanhaId, modelo: l.modelo, historico: l.historico, estimado: l.estimado, frente: schema.frentes.nome };

export async function carregarLancamentos(janela: Periodo): Promise<LancamentoCalc[]> {
  const rows = await executar((d) => d.select(COLUNAS_LANCAMENTO)
    .from(schema.lancamentos)
    .leftJoin(schema.campanhas, and(eq(schema.campanhas.contaId, schema.lancamentos.contaId), eq(schema.campanhas.campanhaId, schema.lancamentos.campanhaId)))
    .leftJoin(schema.frentes, eq(schema.frentes.id, schema.campanhas.frenteId))
    .where(and(gte(schema.lancamentos.instante, janela.inicio), lt(schema.lancamentos.instante, janela.fim))), 10000, "lançamentos");
  return rows.map((r) => ({ ...r, valorBrl: n(r.valorBrl), valorOriginal: n(r.valorOriginal) }));
}

export async function carregarManuais(): Promise<ManualCalc[]> {
  const rows = await executar((d) => d.select({ m: schema.lancamentosManuais, cat: schema.categorias })
    .from(schema.lancamentosManuais).leftJoin(schema.categorias, eq(schema.categorias.id, schema.lancamentosManuais.categoriaId)), PRAZO_PAGINA_MS, "lançamentos manuais");
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

/** Usado por /api/resumo e testes (fora do cache do Next): mesma entrada agregada, só com a memória da instância. */
export async function calcularPeriodoComAnterior(periodo: Periodo, op: OpcoesConsulta): Promise<{ atual: ResultadoDRE; anterior: ResultadoDRE; temBaseAnterior: boolean }> {
  const ant = periodoAnterior(periodo, op.tz);
  const janela = janelaUnica({ inicio: new Date(Math.min(periodo.inicio.getTime(), ant.inicio.getTime())), fim: periodo.fim });
  const [parametros, v, l, manuais, cambio] = await Promise.all([
    carregarParametros(), vendasAgregadas(janela.inicio, janela.fim), lancamentosAgregados(janela.inicio, janela.fim), carregarManuais(), carregarCambio(),
  ]);
  const mz = parametroVigente(parametros, "marco_zero", new Date());
  const e: Entrada = { periodo: janela, parametros, vendas: paraVendasCalc(v), lancamentos: paraLancamentosCalc(l), manuais, opcoes: { ...op, cambio, marcoZero: mz ? new Date(mz.valor) : MARCO_PADRAO } };
  const atual = calcularDRE({ ...e, periodo });
  const anterior = calcularDRE({ ...e, periodo: ant });
  const temBaseAnterior = anterior.totais.numVendas > 0 || anterior.totais.custosTotais > 0;
  return { atual, anterior, temBaseAnterior };
}

/** Última coleta por fonte, para o carimbo "atualizado às": uma linha por fonte, agregada no banco. */
export type EstadoColeta = { ultimaOk: Date | null; ultima: Date; erro: string | null; falhasSeguidas: number; naoConfigurada: boolean };
/** Leitura bruta (sem cache) do estado das coletas; exportada para testes. */
export async function lerColetasBruto() {
  const rows = await executar((d) => d.execute(sql`
    with ult_ok as (select fonte, max(coalesce(terminada_em, iniciada_em)) as ultima_ok from coletas where ok group by fonte)
    select c.fonte,
           max(c.iniciada_em) as ultima,
           u.ultima_ok,
           count(*) filter (where c.ok = false and c.iniciada_em > coalesce(u.ultima_ok, '1970-01-01') and coalesce(c.erro, '') not like 'não configurada%')::int as falhas_seguidas,
           (array_agg(c.erro order by c.iniciada_em desc) filter (where c.ok = false and c.iniciada_em > coalesce(u.ultima_ok, '1970-01-01')))[1] as erro
    from coletas c left join ult_ok u on u.fonte = c.fonte
    group by c.fonte, u.ultima_ok`), PRAZO_PAGINA_MS, "coletas") as unknown as { fonte: string; ultima: string | Date; ultima_ok: string | Date | null; falhas_seguidas: number; erro: string | null }[];
  return rows.map((r) => ({ fonte: r.fonte, ultima: new Date(r.ultima).toISOString(), ultimaOk: r.ultima_ok ? new Date(r.ultima_ok).toISOString() : null, erro: r.erro, falhasSeguidas: r.falhas_seguidas }));
}
const coletasCache = unstable_cache(() => lembrar("coletas", lerColetasBruto, { ttlMs: 30_000, swr: true, rotulo: "coletas" }), ["coletas"], { revalidate: 60, tags: [TAG_DADOS] });

export async function ultimasColetas(): Promise<Map<string, EstadoColeta>> {
  const rows = await coletasCache();
  const m = new Map<string, EstadoColeta>();
  for (const r of rows) m.set(r.fonte, { ultima: new Date(r.ultima), ultimaOk: r.ultimaOk ? new Date(r.ultimaOk) : null, erro: r.erro, falhasSeguidas: r.falhasSeguidas, naoConfigurada: /não configurada/.test(r.erro ?? "") });
  return m;
}

const avisosCache = unstable_cache(async () => (await lembrar("avisos:abertos", () => executar((d) => d.select().from(schema.avisos).where(isNull(schema.avisos.resolvidoEm)).orderBy(desc(schema.avisos.criadoEm)).limit(100), PRAZO_PAGINA_MS, "avisos"), { ttlMs: 30_000, swr: true, rotulo: "avisos abertos" })).map((a) => ({ ...a, criadoEm: a.criadoEm.toISOString(), resolvidoEm: a.resolvidoEm?.toISOString() ?? null })), ["avisos-abertos"], { revalidate: 60, tags: [TAG_DADOS] });
/** Avisos em aberto, com cache de 60 s compartilhado (Data Cache) + memória. */
export async function avisosAbertos() {
  return (await avisosCache()).map((a) => ({ ...a, criadoEm: new Date(a.criadoEm), resolvidoEm: dataOuNull(a.resolvidoEm) }));
}

const DEZ_MIN = 600_000;
/** Arredonda a janela para múltiplos de 10 min (início para baixo, fim para cima): chave de cache estável, superconjunto das linhas. */
export function janelaCache(j: Periodo): Periodo {
  return { inicio: new Date(Math.floor(j.inicio.getTime() / DEZ_MIN) * DEZ_MIN), fim: new Date(Math.ceil(j.fim.getTime() / DEZ_MIN) * DEZ_MIN) };
}
type Serial<T> = T extends Date ? string : T extends (infer U)[] ? Serial<U>[] : T extends object ? { [K in keyof T]: Serial<T[K]> } : T;
const dataOuNull = (s: string | null) => (s ? new Date(s) : null);

const TTL_PEQUENO = 10 * 60_000; // parâmetros, categorias, manuais e câmbio: pequenos e quase não mudam
export const PRAZO_PAGINA_MS = 6000; // consulta que alimenta tela: 6 s; passou disso, mostra o último valor bom (memória) ou o esqueleto
const parametrosCache = unstable_cache(() => lembrar("parametros", async () => (await carregarParametros()).map((p) => ({ ...p, vigenciaInicio: p.vigenciaInicio.toISOString(), vigenciaFim: p.vigenciaFim?.toISOString() ?? null })), { ttlMs: TTL_PEQUENO, swr: true, vazioEhErro: true, rotulo: "parâmetros" }), ["parametros"], { revalidate: 60, tags: [TAG_DADOS] });
const manuaisCache = unstable_cache(() => lembrar("manuais", async () => (await carregarManuais()).map((m) => ({ ...m, comecaEm: m.comecaEm.toISOString(), terminaEm: m.terminaEm?.toISOString() ?? null })), { ttlMs: TTL_PEQUENO, swr: true, rotulo: "lançamentos manuais" }), ["manuais"], { revalidate: 60, tags: [TAG_DADOS] });
const cambioCache = unstable_cache(() => lembrar("cambio", async () => {
  const rows = await executar((d) => d.select().from(schema.cambio).orderBy(asc(schema.cambio.dia)), PRAZO_PAGINA_MS, "câmbio");
  return rows.map((r) => ({ dia: r.dia, par: r.par, taxa: Number(r.taxa) }));
}, { ttlMs: TTL_PEQUENO, swr: true, rotulo: "câmbio" }), ["cambio"], { revalidate: 60, tags: [TAG_DADOS] });
const categoriasCache = unstable_cache(() => lembrar("categorias", () => executar((d) => d.select().from(schema.categorias).orderBy(asc(schema.categorias.nome)), PRAZO_PAGINA_MS, "categorias"), { ttlMs: TTL_PEQUENO, swr: true, rotulo: "categorias" }), ["categorias"], { revalidate: 60, tags: [TAG_DADOS] });

/** Versões com cache de 60 s (mesma tag "dados" invalidada em toda gravação) para as telas de cadastro: evita "dado indisponível" em instância fria. */
export async function carregarManuaisCache(): Promise<ManualCalc[]> {
  return (await manuaisCache()).map((m) => ({ ...m, comecaEm: new Date(m.comecaEm), terminaEm: dataOuNull(m.terminaEm) }));
}
export async function carregarCambioCache(): Promise<CambioFn> { return cambioDeLinhas(await cambioCache()); }
export async function carregarParametrosCache(): Promise<Parametro[]> {
  return (await parametrosCache()).map((p) => ({ ...p, vigenciaInicio: new Date(p.vigenciaInicio), vigenciaFim: dataOuNull(p.vigenciaFim) }));
}
export async function carregarCategoriasCache() { return categoriasCache(); }

function cambioDeLinhas(rows: { dia: string; par: string; taxa: number }[]): CambioFn {
  const porPar = new Map<string, { dia: string; taxa: number }[]>();
  for (const r of rows) { const arr = porPar.get(r.par) ?? []; arr.push({ dia: r.dia, taxa: r.taxa }); porPar.set(r.par, arr); }
  return (par, dia) => {
    const arr = porPar.get(par); if (!arr?.length) return null;
    const alvo = diaBrasilia(dia); let melhor: number | null = null;
    for (const x of arr) { if (x.dia <= alvo) melhor = x.taxa; else break; }
    return melhor ?? arr[0].taxa;
  };
}

/**
 * Entrada para o cálculo com UMA janela para todas as telas: do marco zero (ou antes, se o período pedir histórico) até agora
 * (arredondado a 10 min). Vendas e lançamentos vêm AGREGADOS (src/lib/agregados.ts): uma consulta de cada por janela, e a mesma
 * janela serve a inicial, a barra Hoje, o aquecimento e o /api/resumo — por isso cada coleta lê cada tabela uma vez só.
 * Memória da instância primeiro (30 s, atualiza por trás), Data Cache compartilhado por trás dela.
 */
const entradaAgregadaCache = unstable_cache(async (ini: string, fim: string) => {
  const [vendas, lancamentos] = await Promise.all([vendasAgregadas(new Date(ini), new Date(fim)), lancamentosAgregados(new Date(ini), new Date(fim))]);
  return { vendas: vendas.map((v) => ({ ...v, criadaEm: v.criadaEm?.toISOString() ?? null, aprovadaEm: v.aprovadaEm?.toISOString() ?? null, reembolsadaEm: v.reembolsadaEm?.toISOString() ?? null })),
    lancamentos: lancamentos.map((l) => ({ ...l, instante: l.instante.toISOString() })) };
}, ["entrada-agregada"], { revalidate: 60, tags: [TAG_DADOS] });
export function janelaUnica(pedida: Periodo): Periodo {
  const j = janelaCache(pedida);
  return { inicio: new Date(Math.min(MARCO_PADRAO.getTime(), j.inicio.getTime())), fim: new Date(Math.max(j.fim.getTime(), janelaCache({ inicio: new Date(), fim: new Date() }).fim.getTime())) };
}
export async function montarEntradaAmpla(janelaPedida: Periodo, op: OpcoesConsulta, problemas: string[]): Promise<Entrada> {
  const janela = janelaUnica(janelaPedida);
  const seguro = async <T,>(p: Promise<T>, padrao: T, rotulo: string): Promise<T> => {
    try { return await p; } catch (e) {
      console.error(`[dados] ${rotulo} falhou:`, e); // detalhe só no log
      const msg = e instanceof Error ? e.message : String(e);
      const curto = /statement timeout|tempo esgotado|QUERY_TIMEOUT/i.test(msg) ? "o banco demorou demais; tente de novo em instantes" : /CONNECT|ECONN|conexão/i.test(msg) ? "sem conexão com o banco" : "falha na consulta";
      problemas.push(`${rotulo}: dado indisponível (${curto})`); return padrao;
    }
  };
  const ini = janela.inicio.toISOString(), fim = janela.fim.toISOString();
  // parâmetros primeiro e sozinhos: são obrigatórios e minúsculos; não podem esperar na fila atrás das leituras grandes
  const parametrosS = await parametrosCache().catch((e) => { console.error("[dados] parâmetros indisponíveis:", e); throw new Error("parâmetros indisponíveis: o banco demorou a responder e não há cópia na memória; tente de novo em instantes"); });
  const [agregados, manuaisS, cambioS] = await Promise.all([
    seguro(lembrar(`entrada:${ini}:${fim}`, () => entradaAgregadaCache(ini, fim), { ttlMs: 30_000, swr: true, rotulo: "vendas e lançamentos" }), null, "vendas e lançamentos"),
    seguro(manuaisCache(), [] as Serial<ManualCalc>[], "lançamentos manuais"),
    seguro(cambioCache(), [] as { dia: string; par: string; taxa: number }[], "câmbio"),
  ]);
  if (parametrosS.length === 0) throw new Error("parâmetros indisponíveis: a consulta voltou vazia");
  const parametros: Parametro[] = parametrosS.map((p) => ({ ...p, vigenciaInicio: new Date(p.vigenciaInicio), vigenciaFim: dataOuNull(p.vigenciaFim) }));
  const vendas: VendaCalc[] = paraVendasCalc((agregados?.vendas ?? []).map((v) => ({ ...v, criadaEm: dataOuNull(v.criadaEm), aprovadaEm: dataOuNull(v.aprovadaEm), reembolsadaEm: dataOuNull(v.reembolsadaEm) })));
  const lancamentos: LancamentoCalc[] = paraLancamentosCalc((agregados?.lancamentos ?? []).map((l) => ({ ...l, instante: new Date(l.instante) })));
  const manuais: ManualCalc[] = manuaisS.map((m) => ({ ...m, comecaEm: new Date(m.comecaEm), terminaEm: dataOuNull(m.terminaEm) }));
  const cambio = cambioDeLinhas(cambioS);
  const mz = parametroVigente(parametros, "marco_zero", new Date());
  return { periodo: janela, parametros, vendas, lancamentos, manuais, opcoes: { ...op, cambio, marcoZero: mz ? new Date(mz.valor) : MARCO_PADRAO } };
}

export { lte, db };
