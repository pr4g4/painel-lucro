import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

/**
 * Cliente Postgres pensado para serverless (Vercel) + pooler do Supabase (porta 6543, modo transação):
 * - prepare: false  → exigido pelo pooler em modo transação
 * - max: 1          → uma conexão por instância; o pooler faz o resto
 * - idle_timeout 5s / max_lifetime 5 min / connect_timeout 10s → nada de socket velho esperando para sempre
 * Entre uma requisição e outra a Vercel congela a função; o pooler derruba a conexão parada e, ao descongelar,
 * a próxima consulta pode travar sem erro. `garantirConexao()` faz um `select 1` com prazo curto e recria o cliente se travar.
 */
function criarSql() {
  return postgres(url!, { max: 1, prepare: false, idle_timeout: 5, max_lifetime: 60 * 5, connect_timeout: 10, onnotice: () => {} });
}

type Db = PostgresJsDatabase<typeof schema>;
type Estado = { sql: ReturnType<typeof postgres>; db: Db };
const g = globalThis as unknown as { __painelDb?: Estado };

function atual(): Estado {
  if (!g.__painelDb) { const sql = criarSql(); g.__painelDb = { sql, db: drizzle(sql, { schema }) }; }
  return g.__painelDb;
}

function reciclar() {
  const velho = g.__painelDb;
  g.__painelDb = undefined;
  if (velho) velho.sql.end({ timeout: 1 }).catch(() => {});
  return atual();
}

/** Garante que a conexão responde (prazo em ms). Se travar, recria o cliente e tenta mais uma vez; se falhar de novo, lança erro claro. */
export async function garantirConexao(prazoMs = 3000): Promise<void> {
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const { sql } = atual();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        sql`select 1`,
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("tempo esgotado")), prazoMs); }),
      ]);
      return;
    } catch (e) {
      reciclar();
      if (tentativa === 2) throw new Error(`Banco não respondeu (${e instanceof Error ? e.message : e}). Confira DATABASE_URL e se o projeto do Supabase está ativo.`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
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
