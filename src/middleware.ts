import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { SESSAO_OPCOES, type Sessao } from "@/lib/auth/sessao";

// Rotas públicas: login, webhook da Zenith e rotas de coleta (protegidas por CRON_SECRET)
const PUBLICAS = [/^\/login$/, /^\/api\/coleta(\/|$)/, /^\/api\/zenith\/webhook$/, /^\/api\/saude$/, /^\/api\/seed$/, /^\/api\/resumo$/, /^\/api\/zenith\/reprocessar$/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((r) => r.test(pathname))) return NextResponse.next();
  const res = NextResponse.next();
  const sessao = await getIronSession<Sessao>(req, res, SESSAO_OPCOES);
  if (!sessao.usuarioId) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?volta=${encodeURIComponent(pathname + req.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icone.svg).*)"] };
