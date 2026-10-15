"use client";

import { useActionState } from "react";
import { acaoEntrar, type EstadoLogin } from "./actions";

export function FormularioLogin({ voltar }: { voltar?: string }) {
  const [estado, agir, pendente] = useActionState<EstadoLogin, FormData>(acaoEntrar, {});
  return (
    <form action={agir} className="mt-5 space-y-4">
      {voltar ? <input type="hidden" name="voltar" value={voltar} /> : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Usuário</span>
        <input
          name="usuario"
          autoComplete="username"
          autoCapitalize="none"
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Senha</span>
        <input
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      {estado.erro ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{estado.erro}</p>
      ) : null}
      <button
        type="submit"
        disabled={pendente}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
