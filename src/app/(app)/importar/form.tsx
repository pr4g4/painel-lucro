"use client";
import { useActionState } from "react";
import { importarCsv } from "./acoes";
export function FormImportar() {
  const [estado, acao, pendente] = useActionState(importarCsv, undefined);
  return (
    <form action={acao} className="card p-3 flex flex-col gap-2 text-sm">
      <p className="text-xs text-ink-2">Aceita dois arquivos da Zenith: <b>Conciliação</b> (com id_venda, data e taxas: cria e atualiza vendas) e o <b>Exportar</b> da tela de vendas (referencia, status, valor: só concilia status pela referência; esse vem cortado nas 200 vendas mais recentes, então exporte dia por dia).</p>
      <label>Arquivo CSV da Zenith<input type="file" name="arquivo" accept=".csv,text/csv" className="mt-1 w-full" /></label>
      <label>…ou cole o conteúdo aqui<textarea name="csv" rows={6} className="mt-1 w-full font-mono text-xs" placeholder={'"id_venda";"referencia";"data_hora_brt";"pais";"metodo_pagamento";"status";"moeda";"valor_bruto";"taxa_aplicada";"retencao";"deducoes_totais";"valor_liquido";"status_financeiro"'} /></label>
      <div className="flex items-center gap-2"><button className="btn btn-primary" disabled={pendente}>{pendente ? "Importando…" : "Importar"}</button>{estado?.mensagem && <span className={estado.ok ? "pos" : "neg"}>{estado.mensagem}</span>}</div>
    </form>
  );
}
