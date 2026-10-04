import { asc } from "drizzle-orm";
import { db, schema, executar } from "@/db";
import { contextoPeriodo } from "@/lib/contexto";
import { carregarManuais, carregarCambio } from "@/lib/dados";
import { valorBrlNoPeriodo } from "@/lib/calculo";
import { Suspense } from "react";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { fmtDataHora, fmtMoeda, fmtNum } from "@/lib/formato";
import { paraInputLocal, type Params } from "@/lib/periodo-url";
import { salvarManual, excluirManual, salvarCategoria, excluirCategoria } from "./acoes";

export const dynamic = "force-dynamic";
const FREQ: [string, string][] = [["unica", "única"], ["diaria", "diária"], ["semanal", "semanal"], ["mensal", "mensal"], ["trimestral", "trimestral"], ["semestral", "semestral"], ["anual", "anual"]];

export default async function Manuais({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado, taxaMxn, sessao } = ctx;
  const edita = sessao.papel === "edita";
  const [manuais, cats, cambio] = await Promise.all([carregarManuais(), executar((d) => d.select().from(schema.categorias).orderBy(asc(schema.categorias.nome)), 15000, "categorias"), carregarCambio()]);
  const filtroTipo = typeof sp.tipo === "string" ? sp.tipo : "";
  const filtroCat = typeof sp.cat === "string" ? sp.cat : "";
  const linhas = manuais.filter((m) => (!filtroTipo || m.tipo === filtroTipo) && (!filtroCat || m.categoria === filtroCat))
    .map((m) => ({ m, noPeriodo: valorBrlNoPeriodo(m, estado.periodo, estado.tz, cambio) }));
  const total = linhas.reduce((s, l) => s + (l.m.tipo === "entrada" ? l.noPeriodo.brl : -l.noPeriodo.brl), 0);
  const editar = typeof sp.editar === "string" ? manuais.find((m) => String(m.id) === sp.editar) : undefined;
  const editarRow = editar ? (await executar((d) => d.select().from(schema.lancamentosManuais), 15000, "lançamento")).find((r) => r.id === editar.id) : undefined;

  return (
    <>
      <Suspense fallback={<div className="card p-3 h-24 animate-pulse" />}><SeletorPeriodo {...ctx.propsSeletor} /></Suspense>
      <h1 className="font-semibold">Lançamentos manuais <span className="text-xs text-ink-3 font-normal">saídas e entradas, únicas ou recorrentes · saldo no período {fmtMoeda(total, estado.moeda, taxaMxn)}</span></h1>
      {edita && (
        <form action={salvarManual} className="card p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-sm">
          <input type="hidden" name="tz" value={estado.tz} />
          {editarRow && <input type="hidden" name="id" value={editarRow.id} />}
          <label>Tipo<select name="tipo" defaultValue={editarRow?.tipo ?? "saida"} className="w-full"><option value="saida">Saída</option><option value="entrada">Entrada</option></select></label>
          <label>Moeda<select name="moeda" defaultValue={editarRow?.moeda ?? "BRL"} className="w-full"><option>BRL</option><option>MXN</option><option>USD</option></select></label>
          <label>Valor<input name="valor" inputMode="decimal" required defaultValue={editarRow ? Number(editarRow.valor) : ""} className="w-full" /></label>
          <label>Categoria<select name="categoriaId" defaultValue={editarRow?.categoriaId ?? ""} className="w-full"><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <label className="col-span-2">Descrição<input name="descricao" defaultValue={editarRow?.descricao ?? ""} className="w-full" /></label>
          <label>Frequência<select name="frequencia" defaultValue={editarRow?.frequencia ?? "unica"} className="w-full">{FREQ.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
          <label>Começa em<input type="datetime-local" name="comecaEm" required defaultValue={editarRow ? paraInputLocal(editarRow.comecaEm, estado.tz) : paraInputLocal(estado.agora, estado.tz)} className="w-full" /></label>
          <label>Termina em (opcional)<input type="datetime-local" name="terminaEm" defaultValue={editarRow?.terminaEm ? paraInputLocal(editarRow.terminaEm, estado.tz) : ""} className="w-full" /></label>
          <label>Status<select name="ativo" defaultValue={editarRow && !editarRow.ativo ? "pausado" : "ativo"} className="w-full"><option value="ativo">ativo</option><option value="pausado">pausado</option></select></label>
          <div className="flex items-end gap-2"><button className="btn btn-primary">{editarRow ? "Salvar alteração" : "Adicionar"}</button>{editarRow && <a href="/manuais" className="btn">Cancelar</a>}</div>
        </form>
      )}
      <form className="flex flex-wrap gap-2 text-sm items-end">
        {Object.entries(sp).filter(([k]) => !["tipo", "cat"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
        <label>Tipo<select name="tipo" defaultValue={filtroTipo} className="ml-1"><option value="">todos</option><option value="saida">saída</option><option value="entrada">entrada</option></select></label>
        <label>Categoria<select name="cat" defaultValue={filtroCat} className="ml-1"><option value="">todas</option>{cats.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}</select></label>
        <button className="btn">Filtrar</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="tab">
          <thead><tr><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Frequência</th><th>Começa</th><th>Termina</th><th>Status</th><th className="text-right">Valor cadastrado</th><th className="text-right">No período (BRL)</th>{edita && <th></th>}</tr></thead>
          <tbody>
            {linhas.map(({ m, noPeriodo }) => (
              <tr key={m.id} className={!m.ativo ? "text-ink-3" : ""}>
                <td>{m.tipo === "entrada" ? <span className="text-pos">entrada</span> : "saída"}</td><td>{m.descricao}</td><td>{m.categoria}</td>
                <td>{FREQ.find(([v]) => v === m.frequencia)?.[1]}</td><td className="num">{fmtDataHora(m.comecaEm, estado.tz, "dd/MM/yy HH:mm")}</td><td className="num">{m.terminaEm ? fmtDataHora(m.terminaEm, estado.tz, "dd/MM/yy HH:mm") : "—"}</td>
                <td>{m.ativo ? "ativo" : "pausado"}</td><td className="text-right num">{m.moeda} {fmtNum(m.valor)}</td>
                <td className="text-right num">{noPeriodo.indisponivel ? <span className="text-warn" title={noPeriodo.indisponivel}>indisponível</span> : fmtMoeda(noPeriodo.brl, estado.moeda, taxaMxn)}</td>
                {edita && <td className="whitespace-nowrap"><a className="btn mr-1" href={`/manuais?editar=${m.id}`}>editar</a><form action={excluirManual} className="inline"><input type="hidden" name="id" value={m.id} /><button className="btn">excluir</button></form></td>}
              </tr>
            ))}
            {linhas.length === 0 && <tr><td colSpan={10} className="text-ink-3">Nenhum lançamento.</td></tr>}
          </tbody>
        </table>
      </div>
      <details className="card p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Categorias (editável) e em qual linha da DRE cada uma entra</summary>
        <div className="mt-2 flex flex-col gap-1">
          {cats.map((c) => (
            <form key={c.id} action={salvarCategoria} className="flex flex-wrap gap-2 items-center">
              <input type="hidden" name="id" value={c.id} />
              <input name="nome" defaultValue={c.nome} disabled={!edita} />
              <select name="linhaDre" defaultValue={c.linhaDre} disabled={!edita}><option value="operacao">Operação</option><option value="zapdata">ZapData</option><option value="ia">IA</option></select>
              {edita && <><button className="btn">salvar</button><button className="btn" formAction={excluirCategoria}>excluir</button></>}
            </form>
          ))}
          {edita && <form action={salvarCategoria} className="flex flex-wrap gap-2 items-center mt-1"><input name="nome" placeholder="nova categoria" required /><select name="linhaDre" defaultValue="operacao"><option value="operacao">Operação</option><option value="zapdata">ZapData</option><option value="ia">IA</option></select><button className="btn btn-primary">adicionar</button></form>}
        </div>
      </details>
    </>
  );
}
