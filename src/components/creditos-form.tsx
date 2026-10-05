"use client";
import { useActionState, useState } from "react";
import { registrarCreditoOpenAI } from "@/app/(app)/creditos/acoes";

export function FormCreditoOpenAI({ tz, agoraLocal }: { tz: string; agoraLocal: string }) {
  const [estado, acao, pendente] = useActionState(registrarCreditoOpenAI, undefined);
  const [aberto, setAberto] = useState(false);
  if (!aberto) return <div className="mt-2 flex flex-wrap gap-2 items-center"><button type="button" className="btn" onClick={() => setAberto(true)}>Registrar recarga / saldo conferido</button>{estado?.mensagem && <span className={`text-xs ${estado.ok ? "pos" : "neg"}`}>{estado.mensagem}</span>}</div>;
  return (
    <form action={acao} className="mt-2 flex flex-wrap gap-2 items-end text-sm">
      <input type="hidden" name="tz" value={tz} />
      <label>Tipo<br /><select name="tipo" defaultValue="recarga_ia"><option value="recarga_ia">Recarga (US$)</option><option value="saldo_ref">Saldo conferido (US$)</option></select></label>
      <label>Valor US$<br /><input name="valor" inputMode="decimal" required className="w-24" placeholder="10,00" /></label>
      <label>Quando<br /><input type="datetime-local" name="quando" defaultValue={agoraLocal} /></label>
      <button className="btn btn-primary" disabled={pendente}>{pendente ? "Gravando…" : "Gravar"}</button>
      <button type="button" className="btn" onClick={() => setAberto(false)}>Fechar</button>
      {estado?.mensagem && <span className={`text-xs ${estado.ok ? "pos" : "neg"}`}>{estado.mensagem}</span>}
    </form>
  );
}
