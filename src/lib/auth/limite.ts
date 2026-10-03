import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const JANELA_MIN = 15;
const MAX_FALHAS = 5;

/** Limite de tentativas por IP + usuário, guardado no banco (funciona em serverless). */
export async function bloqueado(chave: string): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_MIN * 60_000);
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.tentativasLogin)
    .where(and(eq(schema.tentativasLogin.chave, chave), eq(schema.tentativasLogin.sucesso, false), gt(schema.tentativasLogin.em, desde)));
  return (r?.n ?? 0) >= MAX_FALHAS;
}

export async function registrarTentativa(chave: string, sucesso: boolean) {
  await db.insert(schema.tentativasLogin).values({ chave, sucesso });
}
