"use client";
import { useActionState } from "react";
import { importarCsv } from "./acoes";
export function FormImportar() {
  const [estado, acao, pendente] = useActionState(importarCsv, undefined);
  return (
    <form action={acao} className="card p-3 flex flex-col gap-2 text-sm">
      <label>Arquivo CSV exportado da Zenith<input type="file" name="arquivo" accept=".csv,text/csv" className="mt-1 w-full" /></label>
      <label>…ou cole o conteúdo aqui<textarea name="csv" rows={6} className="mt-1 w-full font-mono text-xs" placeholder={"id;status;data;moeda;bruto;brl_estimado;liquido;reserva;produto\nZ123;aprovada;2026-10-03 14:05;MXN;149;44.70;;;Fotos 149"} /></label>
      <div className="flex items-center gap-2"><button className="btn btn-primary" disabled={pendente}>{pendente ? "Importando…" : "Importar"}</button>{estado?.mensagem && <span className={estado.ok ? "pos" : "neg"}>{estado.mensagem}</span>}</div>
    </form>
  );
}
