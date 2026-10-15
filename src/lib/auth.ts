import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { gerarHashSenha, verificarSenha } from "@/lib/senha";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db, schema } from "@/db";

export const COOKIE_SESSAO = "sessao";
const DURACAO_SESSAO_DIAS = 30;
const LIMITE_TENTATIVAS = 5;
const JANELA_TENTATIVAS_MIN = 15;

export type Papel = "edita" | "ve";
export type UsuarioSessao = { id: number; usuario: string; nome: string; papel: Papel };

export { gerarHashSenha };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function ipDoPedido() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

async function tentativasRecentes(chave: string) {
  const desde = new Date(Date.now() - JANELA_TENTATIVAS_MIN * 60_000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.tentativasLogin)
    .where(and(eq(schema.tentativasLogin.chave, chave), gt(schema.tentativasLogin.quando, desde)));
  return n;
}

export type ResultadoLogin =
  | { ok: true }
  | { ok: false; motivo: "credenciais" | "bloqueado" };

/** Valida usuário e senha no servidor, cria sessão e grava o cookie. */
export async function entrar(usuario: string, senha: string): Promise<ResultadoLogin> {
  const u = usuario.trim().toLowerCase();
  const chave = `${await ipDoPedido()}|${u}`;

  if ((await tentativasRecentes(chave)) >= LIMITE_TENTATIVAS) {
    return { ok: false, motivo: "bloqueado" };
  }

  const [conta] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, u)).limit(1);
  // Verifica sempre um hash (mesmo sem conta) para o tempo de resposta não revelar se o usuário existe.
  const hashParaChecar = conta?.senhaHash ?? HASH_FALSO;
  const valido = (await verificarSenha(hashParaChecar, senha)) && !!conta;

  if (!valido) {
    await db.insert(schema.tentativasLogin).values({ chave });
    return { ok: false, motivo: "credenciais" };
  }

  // limpa tentativas antigas (housekeeping barato)
  await db.delete(schema.tentativasLogin).where(lt(schema.tentativasLogin.quando, new Date(Date.now() - 24 * 3600_000)));

  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_DIAS * 86_400_000);
  await db.insert(schema.sessoes).values({ tokenHash: hashToken(token), usuarioId: conta.id, expiraEm });

  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiraEm,
  });
  return { ok: true };
}

export async function sair() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) await db.delete(schema.sessoes).where(eq(schema.sessoes.tokenHash, hashToken(token)));
  jar.delete(COOKIE_SESSAO);
}

/** Usuário da sessão atual, ou null. Memoizado por pedido. */
export const usuarioAtual = cache(async (): Promise<UsuarioSessao | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  const [linha] = await db
    .select({
      id: schema.usuarios.id,
      usuario: schema.usuarios.usuario,
      nome: schema.usuarios.nome,
      papel: schema.usuarios.papel,
      expiraEm: schema.sessoes.expiraEm,
    })
    .from(schema.sessoes)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.sessoes.usuarioId))
    .where(eq(schema.sessoes.tokenHash, hashToken(token)))
    .limit(1);
  if (!linha || linha.expiraEm.getTime() < Date.now()) return null;
  return { id: linha.id, usuario: linha.usuario, nome: linha.nome, papel: linha.papel };
});

export async function exigirUsuario(): Promise<UsuarioSessao> {
  const u = await usuarioAtual();
  if (!u) throw new Error("não autenticado");
  return u;
}

/** Só quem edita pode gravar. Ian (vê) recebe erro claro. */
export async function exigirEdicao(): Promise<UsuarioSessao> {
  const u = await exigirUsuario();
  if (u.papel !== "edita") throw new Error("seu usuário só pode visualizar");
  return u;
}

export async function trocarSenha(usuarioId: number, senhaAtual: string, novaSenha: string) {
  const [conta] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, usuarioId)).limit(1);
  if (!conta || !(await verificarSenha(conta.senhaHash, senhaAtual))) {
    return { ok: false as const, motivo: "senha atual incorreta" };
  }
  if (novaSenha.length < 10) return { ok: false as const, motivo: "a nova senha precisa de pelo menos 10 caracteres" };
  await db.update(schema.usuarios).set({ senhaHash: await gerarHashSenha(novaSenha) }).where(eq(schema.usuarios.id, usuarioId));
  // derruba as outras sessões desse usuário
  await db.delete(schema.sessoes).where(eq(schema.sessoes.usuarioId, usuarioId));
  return { ok: true as const };
}

// hash de uma senha aleatória, só para igualar o tempo quando o usuário não existe
const HASH_FALSO =
  "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$Q0WSyd3C6E3TyW9b1aS1h9m0vS0uVbK4Qq1xJd5m1Yk";
