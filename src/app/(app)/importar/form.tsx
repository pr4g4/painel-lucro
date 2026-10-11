"use client";
import { useActionState } from "react";
import { importarCsv, importarCsvTikTokAcao } from "./acoes";
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

export function FormImportarTikTok() {
  const [estado, acao, pendente] = useActionState(importarCsvTikTokAcao, undefined);
  return (
    <form action={acao} className="card p-3 flex flex-col gap-2 text-sm">
      <h2 className="font-semibold">TikTok Ads (CSV do Ads Manager)</h2>
      <p className="text-xs text-ink-2">Sem a API ligada, exporte do Ads Manager um relatório por campanha com as colunas <b>Nome da campanha</b>, <b>Data</b> (por dia; ou por hora, se quiser o gráfico por hora) e <b>Custo</b>. O valor é convertido para R$ pelo câmbio do dia e o imposto vem do parâmetro imposto_tiktok_pct.</p>
      <label>Moeda da conta<select name="moeda" defaultValue="USD" className="ml-2"><option>USD</option><option>MXN</option><option>BRL</option></select></label>
      <label>Arquivo<input type="file" name="arquivo" accept=".csv,.tsv,.txt,text/csv" className="mt-1 w-full" /></label>
      <label>…ou cole o conteúdo<textarea name="csv" rows={4} className="mt-1 w-full font-mono text-xs" placeholder={"Nome da campanha,Data,Custo\nFotos IA MX - TT,2026-10-11,23.40"} /></label>
      <div className="flex items-center gap-2"><button className="btn btn-primary" disabled={pendente}>{pendente ? "Importando…" : "Importar TikTok"}</button>{estado?.mensagem && <span className={estado.ok ? "pos" : "neg"}>{estado.mensagem}</span>}</div>
    </form>
  );
}
