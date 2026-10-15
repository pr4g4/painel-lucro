import { NextResponse, type NextRequest } from "next/server";

const PUBLICAS = ["/login", "/api/saude"];

/** Barreira rápida: sem cookie de sessão, vai para /login. A validade real é checada no layout (banco). */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("sessao")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("voltar", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
