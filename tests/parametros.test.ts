import "dotenv/config";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "../src/db";
import { definirParametro, parametroVigente, valorVigente } from "../src/lib/parametros";

const CHAVE = "teste_vigencia_pct";
const t = (iso: string) => new Date(iso);

after(async () => {
  await db.delete(schema.parametros).where(eq(schema.parametros.chave, CHAVE));
  await pool.end();
});

test("parâmetro vigente respeita início inclusivo e fim exclusivo; alterar hoje não muda o passado", async () => {
  await db.delete(schema.parametros).where(eq(schema.parametros.chave, CHAVE));

  await definirParametro({ chave: CHAVE, valor: 10, inicio: t("2026-09-01T03:00:00Z") });
  assert.equal(await valorVigente(CHAVE, t("2026-08-31T00:00:00Z")), null, "antes da 1ª vigência: indisponível");
  assert.equal(await valorVigente(CHAVE, t("2026-09-01T03:00:00Z")), 10, "início é inclusivo");
  assert.equal(await valorVigente(CHAVE, t("2026-10-10T12:00:00Z")), 10);

  // muda a alíquota a partir de 15/10 — setembro e começo de outubro continuam em 10
  await definirParametro({ chave: CHAVE, valor: 12.5, inicio: t("2026-10-15T03:00:00Z") });
  assert.equal(await valorVigente(CHAVE, t("2026-10-10T12:00:00Z")), 10, "passado não muda");
  assert.equal(await valorVigente(CHAVE, t("2026-10-15T02:59:59Z")), 10, "fim é exclusivo");
  assert.equal(await valorVigente(CHAVE, t("2026-10-15T03:00:00Z")), 12.5);
  assert.equal(await valorVigente(CHAVE, t("2027-01-01T00:00:00Z")), 12.5, "vigência aberta segue");

  const antiga = await parametroVigente(CHAVE, t("2026-09-05T00:00:00Z"));
  assert.ok(antiga?.vigenciaFim, "a vigência antiga foi fechada");
  assert.equal(antiga!.vigenciaFim!.toISOString(), "2026-10-15T03:00:00.000Z");

  // não aceita início anterior ao da vigência aberta
  await assert.rejects(definirParametro({ chave: CHAVE, valor: 1, inicio: t("2026-10-01T00:00:00Z") }));
});

test("parâmetros do seed estão vigentes no marco zero e o fator Meta bate 1,1383", async () => {
  const marcoZero = t("2026-10-03T03:00:00Z");
  const metaPct = await valorVigente("meta_imposto_pct", marcoZero);
  assert.equal(metaPct, 12.15);
  assert.equal(Number((1 / (1 - metaPct! / 100)).toFixed(4)), 1.1383);
  assert.equal(await valorVigente("imposto_lucro_pct", marcoZero), 8);
  const { textoVigente } = await import("../src/lib/parametros");
  assert.equal(await textoVigente("imposto_lucro_base", marcoZero), "lucro_bruto");
});
