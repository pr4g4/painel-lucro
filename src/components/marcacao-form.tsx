"use client";
import { FormGravar } from "@/components/form-gravar";
import { registrarMarcacao, excluirMarcacao } from "@/app/(app)/graficos/acoes";
import { useActionState } from "react";

export function MarcacaoForm({ tz, agoraLocal, marcacoes }: { tz: string; agoraLocal: string; marcacoes: { id: number; rotulo: string; texto: string }[] }) {
  return (
    <div className="text-xs">
      <FormGravar acao={registrarMarcacao} className="flex flex-wrap items-end gap-2" botao="Marcar no gráfico">
        <input type="hidden" name="tz" value={tz} />
        <label>Marcação<br /><input name="texto" placeholder="mudei o robô" defaultValue="mudei o robô" className="w-40" /></label>
        <label>Quando<br /><input type="datetime-local" name="quando" defaultValue={agoraLocal} required /></label>
      </FormGravar>
      {marcacoes.length > 0 && <div className="flex flex-wrap gap-2 mt-2 items-center text-ink-2">{marcacoes.map((m) => <Marcacao key={m.id} m={m} />)}</div>}
    </div>
  );
}

function Marcacao({ m }: { m: { id: number; rotulo: string; texto: string } }) {
  const [estado, agir, pendente] = useActionState(excluirMarcacao, undefined);
  if (estado?.ok) return null;
  return (
    <form action={agir} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border">
      <input type="hidden" name="id" value={m.id} />
      <span className="num">{m.rotulo} · {m.texto}</span>
      <button className="text-ink-3" aria-label="Remover marcação" disabled={pendente} title="remover">×</button>
    </form>
  );
}
