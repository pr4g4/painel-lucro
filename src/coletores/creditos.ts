/** Saldos das IAs: leitura do banco + avaliação de alertas (usado pelo painel e ao fim de cada ciclo de coleta). */
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { schema, executar } from "@/db";
import { saldoKie, saldoOpenAI, alertaSaldo, numeroVigente, inicioDoDia, type LancamentoCalc, type SaldoIA, type Parametro } from "@/lib/calculo";
import { abrirAviso, resolverAvisos } from "./base";

function paraCalc(l: typeof schema.lancamentos.$inferSelect): LancamentoCalc {
  return { id: l.id, fonte: l.fonte, tipo: l.tipo, instante: l.instante, granularidade: l.granularidade, descricao: l.descricao, valorBrl: Number(l.valorBrl), valorOriginal: Number(l.valorOriginal), moeda: l.moeda, contaId: l.contaId, campanhaId: l.campanhaId, modelo: l.modelo, frente: null, historico: l.historico, estimado: l.estimado };
}

export async function carregarCreditos(agora = new Date(), tz = "America/Sao_Paulo"): Promise<{ kie: SaldoIA; openai: SaldoIA; limites: { horas: number; usd: number } }> {
  const desde = new Date(agora.getTime() - 7 * 86_400_000);
  const [recentes, refs, params] = await Promise.all([
    executar((d) => d.select().from(schema.lancamentos).where(and(inArray(schema.lancamentos.fonte, ["kie", "openai"]), gte(schema.lancamentos.instante, desde))), 15000, "créditos"),
    // última referência/leitura mesmo que antiga
    executar((d) => d.select().from(schema.lancamentos).where(or(and(eq(schema.lancamentos.fonte, "openai"), eq(schema.lancamentos.tipo, "saldo_ref")), and(eq(schema.lancamentos.fonte, "kie"), eq(schema.lancamentos.tipo, "saldo_ia")))).orderBy(desc(schema.lancamentos.instante)).limit(50), 15000, "referências"),
    executar((d) => d.select().from(schema.parametros), 10000, "parâmetros"),
  ]);
  const vistos = new Set(recentes.map((r) => r.id));
  const todos = [...recentes, ...refs.filter((r) => !vistos.has(r.id))].map(paraCalc);
  const ps: Parametro[] = params.map((p) => ({ chave: p.chave, valor: p.valor, vigenciaInicio: p.vigenciaInicio, vigenciaFim: p.vigenciaFim }));
  const inicioHoje = inicioDoDia(agora, tz);
  const usdPorCredito = (() => { try { return numeroVigente(ps, "kie_usd_por_credito", agora); } catch { return null; } })();
  return {
    kie: saldoKie(todos, agora, inicioHoje, usdPorCredito),
    openai: saldoOpenAI(todos, agora, inicioHoje),
    limites: { horas: numeroVigente(ps, "alerta_saldo_horas", agora, 6), usd: numeroVigente(ps, "alerta_saldo_usd", agora, 3) },
  };
}

/** Abre/fecha avisos "saldo_baixo" por fonte. Chamado ao fim de cada ciclo de coleta. */
export async function verificarSaldos(agora = new Date()) {
  const c = await carregarCreditos(agora);
  for (const s of [c.kie, c.openai]) {
    const motivo = alertaSaldo(s, c.limites);
    if (motivo) await abrirAviso("saldo_baixo", s.fonte, `Saldo ${s.fonte === "kie" ? "kie.ai" : "OpenAI"}: ${motivo}.`);
    else await resolverAvisos(s.fonte, "saldo_baixo");
  }
  return c;
}
