/**
 * Resumos PRONTOS da inicial (pedido 4, 13/11): o cálculo roda só na coleta (a cada 10 min, ou em "Atualizar agora" e nas
 * gravações que mudam o lucro) e fica gravado na tabela `resumos`, uma linha por período pronto. A inicial, a barra Hoje,
 * o /api/vivo e o /api/resumo só leem essa linha. Webhook da Zenith não recalcula: a próxima coleta faz.
 * Período personalizado, fuso do México ou opções fora do padrão calculam na hora (raro).
 */
import { eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db, schema, executar } from "@/db";
import { lembrar } from "@/lib/memoria";
import { calcularDRE, lucroAcumulado, periodoAnterior, resolverAtalho, type Entrada, type Periodo, type ResultadoDRE, type SaldoIA } from "@/lib/calculo";
import { lerPeriodo, type Params, type EstadoPeriodo } from "@/lib/periodo-url";
import { montarEntradaAmpla, ultimasColetas, avisosAbertos, carregarParametros, carregarManuais, carregarCambio, janelaUnica, TAG_DADOS, type EstadoColeta } from "@/lib/dados";
import { vendasAgregadas, lancamentosAgregados, paraVendasCalc, paraLancamentosCalc } from "@/lib/agregados";
import { funilDoPeriodo, propsSeletor, type Funil } from "@/lib/contexto";
import { carregarCreditos, type Creditos } from "@/coletores/creditos";
import { parametroVigente } from "@/lib/calculo";

export const ATALHOS_PRONTOS = ["hoje", "ontem", "7_dias", "marco_zero", "mes_atual", "ultimas_6h", "ultimas_24h"] as const;
export type AtalhoPronto = typeof ATALHOS_PRONTOS[number];
const TZ = process.env.APP_TZ ?? "America/Sao_Paulo";
const MARCO_PADRAO = "2026-10-03T03:00:00.000Z";

export type Totais = ResultadoDRE["totais"];
export type ColetaS = { ultimaOk: string | null; ultima: string; erro: string | null; falhasSeguidas: number; naoConfigurada: boolean };
export type CreditosS = { kie: Omit<SaldoIA, "lidoEm"> & { lidoEm: string | null }; openai: Omit<SaldoIA, "lidoEm"> & { lidoEm: string | null }; limites: { horas: number; usd: number } };
export type ResumoInicial = {
  atalho: string; tz: string; calculadoEm: string; agora: string; marcoZero: string;
  periodo: { inicio: string; fim: string }; anterior: { inicio: string; fim: string };
  totais: Totais; totaisAnterior: Totais; temBaseAnterior: boolean; avisosCalculo: string[];
  funil: Funil; funilAnterior: Funil;
  acum: { gran: "hora" | "dia"; pontos: { rotulo: string; valor: number; acumulado: number }[] };
  hoje: Totais;
  taxaMxn: number | null;
  coletas: Record<string, ColetaS>;
  avisosTipos: string[];
  creditos: CreditosS | null;
  problemas: string[];
};
export type Extras = { coletas: Map<string, EstadoColeta>; avisosTipos: string[]; creditos: Creditos | null };

/** Monta o resumo de um estado de período a partir da entrada (pura: nada de banco). */
export function montarResumo(entrada: Entrada, estado: EstadoPeriodo, extras: Extras, problemas: string[], calculadoEm = new Date()): ResumoInicial {
  const op = { tz: estado.tz, incluirHistorico: estado.incluirHistorico, incluirManuais: estado.incluirManuais };
  const calc = (p: Periodo) => calcularDRE({ ...entrada, periodo: p, opcoes: { ...entrada.opcoes, ...op } });
  const atual = calc(estado.periodo), anterior = calc(estado.anterior);
  const hojeP = resolverAtalho("hoje", estado.agora, estado.marcoZero, estado.tz).periodo;
  const hoje = estado.atalho === "hoje" ? atual : calc(hojeP);
  const temBaseAnterior = anterior.totais.numVendas > 0 || anterior.totais.custosTotais > 0 || anterior.totais.pendentesQtd > 0 || temDados(entrada, estado.anterior, op.incluirHistorico);
  const acum = lucroAcumulado({ ...entrada, opcoes: { ...entrada.opcoes, ...op } }, estado.periodo, estado.tz);
  const coletas: Record<string, ColetaS> = {};
  for (const [f, c] of extras.coletas) coletas[f] = { ultimaOk: c.ultimaOk?.toISOString() ?? null, ultima: c.ultima.toISOString(), erro: c.erro, falhasSeguidas: c.falhasSeguidas, naoConfigurada: c.naoConfigurada };
  const cr = extras.creditos;
  return {
    atalho: estado.atalho, tz: estado.tz, calculadoEm: calculadoEm.toISOString(), agora: estado.agora.toISOString(), marcoZero: estado.marcoZero.toISOString(),
    periodo: { inicio: estado.periodo.inicio.toISOString(), fim: estado.periodo.fim.toISOString() }, anterior: { inicio: estado.anterior.inicio.toISOString(), fim: estado.anterior.fim.toISOString() },
    totais: atual.totais, totaisAnterior: anterior.totais, temBaseAnterior, avisosCalculo: atual.avisos,
    funil: funilDoPeriodo(entrada, estado.periodo, op.incluirHistorico), funilAnterior: funilDoPeriodo(entrada, estado.anterior, op.incluirHistorico),
    acum: { gran: acum.gran, pontos: acum.pontos.map((p) => ({ rotulo: p.rotulo, valor: p.valor, acumulado: p.acumulado })) },
    hoje: hoje.totais, taxaMxn: entrada.opcoes.cambio("MXNBRL", estado.agora),
    coletas, avisosTipos: extras.avisosTipos,
    creditos: cr ? { ...cr, kie: { ...cr.kie, lidoEm: cr.kie.lidoEm?.toISOString() ?? null }, openai: { ...cr.openai, lidoEm: cr.openai.lidoEm?.toISOString() ?? null } } : null,
    problemas,
  };
}
function temDados(e: Entrada, p: Periodo, incluirHistorico: boolean): boolean {
  if (!incluirHistorico && p.fim.getTime() <= e.opcoes.marcoZero.getTime()) return false;
  const dentro = (d: Date | null) => !!d && d >= p.inicio && d < p.fim;
  const conta = (h: boolean) => incluirHistorico || !h;
  return e.vendas.some((v) => conta(v.historico) && (dentro(v.aprovadaEm) || dentro(v.criadaEm))) || e.lancamentos.some((l) => conta(l.historico) && dentro(l.instante));
}

/** Extras (coletas, avisos, créditos) lidos uma vez por recálculo. Nunca derrubam o resumo. */
async function lerExtras(): Promise<{ extras: Extras; problemas: string[] }> {
  const problemas: string[] = [];
  const [coletas, avisos, creditos] = await Promise.all([
    ultimasColetas().catch((e) => { problemas.push(`coletas: dado indisponível (${e instanceof Error ? e.message : e})`); return new Map<string, EstadoColeta>(); }),
    avisosAbertos().catch(() => []),
    carregarCreditos().catch(() => null),
  ]);
  return { extras: { coletas, avisosTipos: [...new Set(avisos.map((a) => a.tipo))], creditos }, problemas };
}

/** Entrada direta (sem o cache do Next): usada pelo recálculo na coleta e pelos testes. */
export async function entradaDireta(janelaPedida: Periodo): Promise<Entrada> {
  const janela = janelaUnica(janelaPedida);
  const [parametros, v, l, manuais, cambio] = await Promise.all([
    carregarParametros(), vendasAgregadas(janela.inicio, janela.fim), lancamentosAgregados(janela.inicio, janela.fim), carregarManuais(), carregarCambio(),
  ]);
  const mz = parametroVigente(parametros, "marco_zero", new Date());
  return { periodo: janela, parametros, vendas: paraVendasCalc(v), lancamentos: paraLancamentosCalc(l), manuais, opcoes: { tz: TZ, incluirHistorico: false, incluirManuais: true, cambio, marcoZero: mz ? new Date(mz.valor) : new Date(MARCO_PADRAO) } };
}

/**
 * Recalcula e grava todos os resumos prontos (1 leitura agregada de vendas, 1 de lançamentos, extras) e a linha "vivo".
 * Chamado no fim de toda coleta, em "Atualizar agora" e nas gravações que mudam o lucro (manuais, parâmetros, CSV, venda criada).
 */
export async function recalcularResumos(agora = new Date()): Promise<{ gravados: number; ms: number }> {
  const t0 = Date.now();
  const marcoTudo = resolverAtalho("marco_zero", agora, new Date(MARCO_PADRAO), TZ).periodo;
  const entrada = await entradaDireta({ inicio: new Date(Math.min(marcoTudo.inicio.getTime(), periodoAnterior(marcoTudo, TZ).inicio.getTime())), fim: agora });
  const { extras, problemas } = await lerExtras();
  const linhas: { chave: string; calculadoEm: Date; dados: unknown }[] = [];
  for (const atalho of ATALHOS_PRONTOS) {
    const estado = lerPeriodo({ p: atalho }, entrada.opcoes.marcoZero, agora);
    linhas.push({ chave: `inicial:${atalho}`, calculadoEm: agora, dados: montarResumo(entrada, estado, extras, problemas, agora) });
  }
  const hoje = linhas.find((l) => l.chave === "inicial:hoje")!.dados as ResumoInicial;
  linhas.push({ chave: "vivo:hoje", calculadoEm: agora, dados: { vendas: hoje.totais.numVendas, lucro: hoje.totais.lucroLiquido, ultimaMxn: null, dia: diaDe(agora), calculadoEm: agora.toISOString() } });
  await executar((d) => d.insert(schema.resumos).values(linhas).onConflictDoUpdate({ target: schema.resumos.chave, set: { calculadoEm: sql`excluded.calculado_em`, dados: sql`excluded.dados` } }), 15000, "gravar resumos");
  try { (await import("@/lib/memoria")).esquecerMemoria("resumo:"); } catch { /* fora de requisição */ }
  return { gravados: linhas.length, ms: Date.now() - t0 };
}
const diaDe = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Lê UMA linha pronta (memória 20 s + Data Cache 60 s). null se ainda não existe. */
const resumoCache = unstable_cache(async (chave: string) => {
  const [r] = await executar((d) => d.select().from(schema.resumos).where(eq(schema.resumos.chave, chave)).limit(1), 8000, "resumo pronto");
  return r ? { calculadoEm: r.calculadoEm.toISOString(), dados: r.dados as ResumoInicial } : null;
}, ["resumo-pronto"], { revalidate: 60, tags: [TAG_DADOS] });
export async function lerResumoPronto(atalho: AtalhoPronto): Promise<ResumoInicial | null> {
  const r = await lembrar(`resumo:inicial:${atalho}`, () => resumoCache(`inicial:${atalho}`), { ttlMs: 20_000, swr: true, rotulo: "resumo pronto" });
  return r?.dados ?? null;
}
export async function lerVivo(): Promise<{ vendas: number; lucro: number; ultimaMxn: number | null; dia: string; calculadoEm: string } | null> {
  const [r] = await executar((d) => d.select({ dados: schema.resumos.dados }).from(schema.resumos).where(eq(schema.resumos.chave, "vivo:hoje")).limit(1), 8000, "vivo");
  return (r?.dados as { vendas: number; lucro: number; ultimaMxn: number | null; dia: string; calculadoEm: string } | undefined) ?? null;
}

/** O que a inicial pede: pronto quando o período é um atalho pronto com as opções padrão; senão calcula na hora (raro). */
export function ehPedidoPronto(sp: Params): AtalhoPronto | null {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const p = (um(sp.p) ?? "marco_zero") as AtalhoPronto;
  if (!(ATALHOS_PRONTOS as readonly string[]).includes(p)) return null;
  if (um(sp.de) || um(sp.ate) || um(sp.hist) === "1" || um(sp.manuais) === "0" || (um(sp.tz) && um(sp.tz) !== TZ)) return null;
  return p;
}
export async function resumoDaInicial(sp: Params): Promise<{ r: ResumoInicial; estado: EstadoPeriodo; origem: "pronto" | "vivo" }> {
  const pronto = ehPedidoPronto(sp);
  if (pronto) {
    const r = await lerResumoPronto(pronto);
    if (r) return { r, estado: lerPeriodo(sp, new Date(r.marcoZero), new Date(r.agora)), origem: "pronto" };
  }
  // ao vivo: período personalizado/opções fora do padrão, ou ainda sem resumo gravado (primeira coleta após o deploy)
  const problemas: string[] = [];
  let estado = lerPeriodo(sp, new Date(MARCO_PADRAO));
  const janela: Periodo = { inicio: new Date(Math.min(estado.periodo.inicio.getTime(), estado.anterior.inicio.getTime())), fim: estado.periodo.fim };
  const entrada = await montarEntradaAmpla(janela, { tz: estado.tz, incluirHistorico: estado.incluirHistorico, incluirManuais: estado.incluirManuais }, problemas);
  estado = lerPeriodo(sp, entrada.opcoes.marcoZero);
  const { extras, problemas: p2 } = await lerExtras();
  if (pronto) void recalcularResumos().catch(() => {}); // deixa pronto para a próxima abertura
  return { r: montarResumo(entrada, estado, extras, [...problemas, ...p2]), estado, origem: "vivo" };
}
export function propsSeletorDe(estado: EstadoPeriodo, podeSalvar: boolean) { return propsSeletor(estado, podeSalvar); }
export { inArray, db };
