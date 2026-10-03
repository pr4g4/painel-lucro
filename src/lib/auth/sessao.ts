import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Sessao = { usuarioId?: number; usuario?: string; nome?: string; papel?: "edita" | "ve" };

export const SESSAO_OPCOES: SessionOptions = {
  cookieName: "painel_sessao",
  password: process.env.SESSION_SECRET ?? "",
  ttl: 60 * 60 * 24 * 14, // 14 dias
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET precisa ter 32+ caracteres");
}

export async function getSessao() {
  return getIronSession<Sessao>(await cookies(), SESSAO_OPCOES);
}

/** Garante login; se `papel` = "edita", exige permissão de edição (Erick). */
export async function exigirSessao(papel?: "edita") {
  const s = await getSessao();
  if (!s.usuarioId) redirect("/login");
  if (papel === "edita" && s.papel !== "edita") redirect("/?erro=sem-permissao");
  return s;
}
