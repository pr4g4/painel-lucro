"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

export type EstadoGravar = { ok: boolean; mensagem: string } | undefined;

/**
 * Formulário de gravação com confirmação na tela. Ao receber "ok" força router.refresh():
 * com a aba em segundo plano a gravação entra, mas a tela podia ficar sem atualizar.
 */
export function FormGravar({ acao, className, botao, botaoPendente = "Gravando…", extra, children }: {
  acao: (prev: EstadoGravar, form: FormData) => Promise<EstadoGravar>; className?: string; botao: string; botaoPendente?: string; extra?: React.ReactNode; children: React.ReactNode;
}) {
  const [estado, agir, pendente] = useActionState(acao, undefined);
  const router = useRouter();
  useEffect(() => { if (estado?.ok) router.refresh(); }, [estado, router]);
  return (
    <form action={agir} className={className}>
      {children}
      <div className="flex items-end gap-2 flex-wrap">
        <button className="btn btn-primary" disabled={pendente}>{pendente ? botaoPendente : botao}</button>
        {extra}
        {estado?.mensagem && <span className={`text-xs self-center ${estado.ok ? "pos" : "neg"}`} role="status">{estado.mensagem}</span>}
      </div>
    </form>
  );
}
