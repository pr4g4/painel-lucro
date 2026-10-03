import { NextResponse, type NextRequest } from "next/server";
import { coletar, coletarTudo, FONTES, type Fonte } from "@/coletores";
import { garantirConexao } from "@/db";
import { getIronSession } from "iron-session";
import { SESSAO_OPCOES, type Sessao } from "@/lib/auth/sessao";

export const maxDuration = 60; // Vercel Hobby permite até 60 s
export const dynamic = "force-dynamic";

/** POST /api/coleta/{fonte|todas}. Autoriza por CRON_SECRET (agendador) ou por sessão de usuário logado (botão "Atualizar agora"). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ fonte: string }> }) {
  const { fonte } = await params;
  const auth = req.headers.get("authorization") ?? "";
  const segredoOk = !!process.env.CRON_SECRET && (auth === `Bearer ${process.env.CRON_SECRET}` || req.nextUrl.searchParams.get("segredo") === process.env.CRON_SECRET);
  let sessaoOk = false;
  if (!segredoOk) {
    const res = NextResponse.next();
    const s = await getIronSession<Sessao>(req, res, SESSAO_OPCOES);
    sessaoOk = !!s.usuarioId;
  }
  if (!segredoOk && !sessaoOk) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  await garantirConexao();
  if (fonte === "todas") return NextResponse.json({ resultados: await coletarTudo() });
  if (!(FONTES as readonly string[]).includes(fonte)) return NextResponse.json({ erro: `fonte desconhecida: ${fonte}` }, { status: 404 });
  return NextResponse.json({ resultado: await coletar(fonte as Fonte) });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ fonte: string }> }) {
  // pg_net do Supabase e navegadores: aceitar GET com ?segredo=
  return POST(req, ctx);
}
