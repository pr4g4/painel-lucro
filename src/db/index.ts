import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalParaPool = globalThis as unknown as { __poolPainel?: Pool };

function criarPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  return new Pool({ connectionString: url, max: 10 });
}

// Em desenvolvimento o módulo recarrega a cada edição; reaproveita o pool.
export const pool = globalParaPool.__poolPainel ?? criarPool();
if (process.env.NODE_ENV !== "production") globalParaPool.__poolPainel = pool;

export const db = drizzle(pool, { schema });
export { schema };
