import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

/**
 * Cliente Postgres para serverless (Vercel Fluid) + pooler do Supabase (porta 6543, modo transação).
 * - prepare: false → exigido pelo pooler em modo transação
 * - max: 1, idle_timeout 3 s, max_lifetime 60 s, connect_timeout 10 s → conexão curta, nunca fica "velha" entre invocações
 * - Conexão destruída/expirada no meio de uma consulta → `executar()` recria o cliente e repete UMA vez.
 */
function criarSql() {
  return postgres(url!, { max: 1, prepare: false, idle_timeout: 3, max_lifetime: 60, connect_timeout: 10, onnotice: () => {} });
}

type Db = PostgresJsDatabase<typeof schema>;
type Estado = { sql: ReturnType<typeof postgres>; db: Db };
const g = globalThis as unknown as { __painelDb?: Estado };

function atual(): Estado {
  if (!g.__painelDb) { const sql = criarSql(); g.__painelDb = { sql, db: drizzle(sql, { schema }) }; }
  return g.__painelDb;
}

export function reciclarConexao() {
  const velho = g.__painelDb;
  g.__painelDb = undefined;
  if (velho) velho.sql.end({ timeout: 1 }).catch(() => {});
  return atual();
}

const CODIGOS_CONEXAO = ["CONNECTION_DESTROYED", "CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECT_TIMEOUT", "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT"];
export function erroDeConexao(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  return CODIGOS_CONEXAO.some((c) => code === c || msg.includes(c)) || msg.includes("tempo esgotado");
}

/** Roda uma consulta com prazo; se a conexão estava morta, recria o cliente e repete uma vez. */
export async function executar<T>(fn: (db: Db) => Promise<T>, prazoMs = 8000, rotulo = "consulta"): Promise<T> {
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fn(atual().db),
        new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error(`${rotulo}: tempo esgotado (${prazoMs / 1000}s)`)), prazoMs); }),
      ]);
    } catch (e) {
      if (tentativa === 2 || !erroDeConexao(e)) throw e;
      reciclarConexao();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw new Error("inalcançável");
}

/** Garante que a conexão responde (prazo curto). Se travar, recria o cliente e tenta mais uma vez. */
export async function garantirConexao(prazoMs = 3000): Promise<void> {
  await executar(async (d) => { await d.execute(sqlSelect1); }, prazoMs, "teste de conexão").catch((e) => {
    throw new Error(`Banco não respondeu (${e instanceof Error ? e.message : e}). Confira DATABASE_URL e se o projeto do Supabase está ativo.`);
  });
}
import { sql as dsql } from "drizzle-orm";
const sqlSelect1 = dsql`select 1`;

/** `db` é um proxy para a instância atual: quem importou continua funcionando depois de uma reciclagem. */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const inst = atual().db as unknown as Record<string | symbol, unknown>;
    const v = inst[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(inst) : v;
  },
});

export { schema };
