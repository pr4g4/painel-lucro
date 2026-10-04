"use server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema, executar } from "@/db";
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
    // um prazo único e folgado para o conjunto (a função tem 30 s); erro de conexão real é repetido uma vez pelo `executar`
    await comPrazo((async () => {
      if (await bloqueado(chave)) throw new BloqueadoErro();
      [u] = await executar((d) => d.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario)).limit(1));
      ok = u ? await conferirSenha(senha, u.senhaHash) : false;
      await registrarTentativa(chave, ok);
    })(), 20_000, "login");
  } catch (e) {
    if (e instanceof BloqueadoErro) return { erro: "Muitas tentativas. Aguarde 15 minutos.", usuario };
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

class BloqueadoErro extends Error {}

/** Nunca deixar o botão "Entrando…" preso: o conjunto tem prazo e vira mensagem na tela. */
function comPrazo<T>(p: Promise<T>, ms: number, etapa: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error(`${etapa} demorou mais de ${ms / 1000}s`)), ms); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}
