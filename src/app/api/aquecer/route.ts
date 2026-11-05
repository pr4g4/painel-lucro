import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { SESSAO_OPCOES, type Sessao } from "@/lib/auth/sessao";
import { aquecer } from "@/lib/aquecer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET/POST /api/aquecer — refaz as leituras da inicial para o cache compartilhado. Chamado pela coleta (CRON_SECRET) ou por quem está logado. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const segredoOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const s = await getIronSession<Sessao>(req, NextResponse.next(), SESSAO_OPCOES);
  if (!segredoOk && !s.usuarioId) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  return NextResponse.json(await aquecer());
}
export const POST = GET;
