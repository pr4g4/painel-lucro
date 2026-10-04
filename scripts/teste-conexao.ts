import { config } from "dotenv"; config({ path: ".env.local" });
import postgres from "postgres";
(async () => {
  const { executar, db, schema } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  // 1) consulta normal
  const a = await executar((d) => d.select().from(schema.parametros).limit(1));
  console.log("consulta normal ok:", a.length, "linha(s)");
  // 2) mata a conexão do cliente pelo lado do servidor (simula socket morto após congelamento)
  const admin = postgres(process.env.DATABASE_URL!, { max: 1 });
  const mortas = await admin`select pg_terminate_backend(pid) from pg_stat_activity where pid <> pg_backend_pid() and datname = current_database() and backend_type = 'client backend'`;
  console.log("conexões derrubadas pelo servidor:", mortas.length);
  // 3) consulta de novo: deve repetir num cliente novo sem erro, e várias em paralelo não podem cair em cascata
  const r = await Promise.all([1, 2, 3, 4, 5].map((i) => executar((d) => d.execute(sql`select ${i}::int as n, pg_sleep(0.2)`))));
  console.log("após conexão morta, 5 consultas paralelas ok:", r.length);
  const b = await db.select().from(schema.usuarios);
  console.log("via proxy db ok:", b.length, "usuários");
  await admin.end();
  process.exit(0);
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
