import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { gerarHash } from "@/lib/auth/senha";

export const dynamic = "force-dynamic";

/** Seed de produção sem instalar nada: cria o que não existe (usuários, parâmetros, frentes, categorias, ZapData). Exige CRON_SECRET. */
export async function GET(req: NextRequest) {
  const seg = req.nextUrl.searchParams.get("segredo") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || seg !== process.env.CRON_SECRET) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const feito: string[] = [];
  const inicio = new Date("2026-09-01T03:00:00Z");
  for (const [usuario, nome, papel, env] of [["erick", "Erick", "edita", "SEED_SENHA_ERICK"], ["ian", "Ian", "ve", "SEED_SENHA_IAN"]] as const) {
    const [existe] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario)).limit(1);
    if (existe) continue;
    const senha = process.env[env];
    if (!senha) { feito.push(`${usuario}: defina ${env}`); continue; }
    await db.insert(schema.usuarios).values({ usuario, nome, papel, senhaHash: await gerarHash(senha) }); feito.push(`usuário ${usuario} criado`);
  }
  const { garantirBasico } = await import("@/coletores/basico");
  feito.push(...(await garantirBasico()));
  return NextResponse.json({ ok: true, feito });
}
