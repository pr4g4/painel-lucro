import "dotenv/config";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/db";

after(() => pool.end());

async function contagens() {
  const r = await db.execute(sql`
    select (select count(*) from usuarios)::int as usuarios,
           (select count(*) from parametros)::int as parametros,
           (select count(*) from frentes)::int as frentes,
           (select count(*) from categorias)::int as categorias,
           (select count(*) from lancamentos_manuais)::int as manuais`);
  return r.rows[0];
}

test("rodar o seed duas vezes não duplica nada", async () => {
  const antes = await contagens();
  execSync("npx tsx src/db/seed.ts", { stdio: "pipe" });
  const depois = await contagens();
  assert.deepEqual(depois, antes);
  assert.equal(depois.usuarios, 2);
  assert.equal(depois.manuais, 1);
});
