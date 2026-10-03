"use client";
import { useActionState } from "react";
import { entrar } from "./acoes";

export function FormLogin({ volta }: { volta: string }) {
  const [estado, acao, pendente] = useActionState(entrar, undefined);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="volta" value={volta} />
      <label className="text-sm">Usuário<input name="usuario" autoComplete="username" required defaultValue={estado?.usuario ?? ""} className="mt-1 w-full" /></label>
      <label className="text-sm">Senha<input name="senha" type="password" autoComplete="current-password" required className="mt-1 w-full" /></label>
      {estado?.erro && <p role="alert" className="text-sm text-neg">{estado.erro}</p>}
      <button className="btn btn-primary mt-1" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
