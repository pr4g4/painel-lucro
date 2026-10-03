"use server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema, garantirConexao } from "@/db";
import { conferirSenha } from "@/lib/auth/senha";
import { getSessao } from "@/lib/auth/sessao";
import { bloqueado, registrarTentativa } from "@/lib/auth/limite";

export async function entrar(_prev: { erro?: string; usuario?: string } | undefined, form: FormData): Promise<{ erro?: string; usuario?: string }> {
  const usuario = String(form.get("usuario") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const volta = String(form.get("volta") ?? "") || "/";
  if (!usuario || !senha) return { erro: "Informe usuário e senha.", usuario };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const chave = `${ip}|${usuario}`;
  let u: typeof schema.usuarios.$inferSelect | undefined;
  let ok = false;
  try {
    await comPrazo(garantirConexao(), 12_000, "conexão com o banco");
    if (await comPrazo(bloqueado(chave), 8_000, "limite de tentativas")) return { erro: "Muitas tentativas. Aguarde 15 minutos.", usuario };
    [u] = await comPrazo(db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario)).limit(1), 8_000, "busca do usuário");
    ok = u ? await comPrazo(conferirSenha(senha, u.senhaHash), 8_000, "conferência da senha") : false;
    await comPrazo(registrarTentativa(chave, ok), 8_000, "registro da tentativa");
  } catch (e) {
    return { erro: `Falha no login: ${e instanceof Error ? e.message : String(e)}`, usuario };
  }
  if (!u || !ok) return { erro: u ? "Usuário ou senha inválidos." : "Usuário não existe. Rode /api/seed?segredo=... para criar os usuários.", usuario };
  const s = await getSessao();
  s.usuarioId = u.id; s.usuario = u.usuario; s.nome = u.nome; s.papel = u.papel;
  await s.save();
  redirect(volta.startsWith("/") ? volta : "/");
}

export async function sair() {
  const s = await getSessao();
  s.destroy();
  redirect("/login");
}

/** Nunca deixar o botão "Entrando…" preso: cada etapa tem prazo e vira mensagem na tela. */
function comPrazo<T>(p: Promise<T>, ms: number, etapa: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error(`${etapa} demorou mais de ${ms / 1000}s`)), ms); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}
