"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { entrar, sair } from "@/lib/auth";

const esquema = z.object({
  usuario: z.string().min(1).max(60),
  senha: z.string().min(1).max(200),
  voltar: z.string().optional(),
});

export type EstadoLogin = { erro?: string };

export async function acaoEntrar(_prev: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const dados = esquema.safeParse({
    usuario: form.get("usuario"),
    senha: form.get("senha"),
    voltar: form.get("voltar") || undefined,
  });
  if (!dados.success) return { erro: "Preencha usuário e senha." };

  const r = await entrar(dados.data.usuario, dados.data.senha);
  if (!r.ok) {
    return {
      erro:
        r.motivo === "bloqueado"
          ? "Muitas tentativas. Aguarde 15 minutos e tente de novo."
          : "Usuário ou senha incorretos.",
    };
  }
  const destino = dados.data.voltar && dados.data.voltar.startsWith("/") && !dados.data.voltar.startsWith("//")
    ? dados.data.voltar
    : "/";
  redirect(destino);
}

export async function acaoSair() {
  await sair();
  redirect("/login");
}
