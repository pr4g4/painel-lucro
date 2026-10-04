import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql as dsql } from "drizzle-orm";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

/**
 * Cliente Postgres para Vercel + pooler do Supabase (porta 6543, modo transação).
 * - prepare: false → exigido pelo pooler em modo transação
 * - max: 3 → poucas conexões por instância; o pooler faz o resto
 * - connect_timeout 15 s, idle_timeout 20 s, max_lifetime padrão (30–60 min, aleatório) → nada agressivo
 * - NUNCA derrubamos a conexão por cima de consultas em andamento (foi isso que causava CONNECTION_DESTROYED em cascata).
 *   Se uma consulta falhar com erro REAL de conexão (socket morto depois de a função ficar congelada), descartamos o cliente,
 *   deixamos o antigo fechar sozinho e repetimos a consulta uma vez num cliente novo.
 */
function criarSql() {
  return postgres(url!, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 15, onnotice: () => {} });
}

type Db = PostgresJsDatabase<typeof schema>;
type Estado = { sql: ReturnType<typeof postgres>; db: Db };
const g = globalThis as unknown as { __painelDb?: Estado };

function atual(): Estado {
  if (!g.__painelDb) { const sql = criarSql(); g.__painelDb = { sql, db: drizzle(sql, { schema }) }; }
  return g.__painelDb;
}

/** Descarta o cliente atual sem matar consultas em andamento: o antigo fecha quando ficar ocioso. */
export function reciclarConexao() {
  const velho = g.__painelDb;
  g.__painelDb = undefined;
  if (velho) velho.sql.end().catch(() => {}); // sem timeout: espera as consultas pendentes terminarem
  return atual();
}

// Erros do cliente (socket) e do servidor (57P01 admin_shutdown, 57P02 crash_shutdown, 57P03 cannot_connect_now, 08xxx connection exception)
const CODIGOS_CONEXAO = ["CONNECTION_DESTROYED", "CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECT_TIMEOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "57P01", "57P02", "57P03", "08000", "08003", "08006", "08001", "08004"];
export function erroDeConexao(e: unknown): boolean {
  const codes = [(e as { code?: string })?.code, (e as { cause?: { code?: string } })?.cause?.code].filter(Boolean) as string[];
  const msg = e instanceof Error ? `${e.message} ${(e as { cause?: Error }).cause?.message ?? ""}` : String(e);
  return CODIGOS_CONEXAO.some((c) => codes.includes(c) || msg.includes(c)) || /terminating connection|server closed the connection/i.test(msg);
}

/** Roda uma consulta; se falhar por conexão morta, troca o cliente e repete uma vez. Sem prazo artificial. */
export async function executar<T>(fn: (db: Db) => Promise<T>, _prazoMs?: number, _rotulo?: string): Promise<T> {
  try {
    return await fn(atual().db);
  } catch (e) {
    if (!erroDeConexao(e)) throw e;
    reciclarConexao();
    return await fn(atual().db);
  }
}

/** Mantido para compatibilidade: uma consulta simples com a mesma regra de repetição (sem prazo curto, sem cascata). */
export async function garantirConexao(): Promise<void> {
  await executar(async (d) => { await d.execute(dsql`select 1`); });
}

/** `db` é um proxy para a instância atual: quem importou continua funcionando depois de uma reciclagem. */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const inst = atual().db as unknown as Record<string | symbol, unknown>;
    const v = inst[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(inst) : v;
  },
});

export { schema };
