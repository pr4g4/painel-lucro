"use server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
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
  if (await bloqueado(chave)) return { erro: "Muitas tentativas. Aguarde 15 minutos.", usuario };
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario)).limit(1);
  const ok = u ? await conferirSenha(senha, u.senhaHash) : false;
  await registrarTentativa(chave, ok);
  if (!u || !ok) return { erro: "Usuário ou senha inválidos.", usuario };
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
