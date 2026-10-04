"use client";
import { useMemo, useState } from "react";
import type { LinhaDRE } from "@/lib/calculo";
import { fmtMoeda, fmtPct, fmtPctSimples } from "@/lib/formato";

export type ColunaDRE = { chave: string; rotulo: string; linhas: LinhaDRE[]; receitaLiquida: number };

export function TabelaDRE(props: { atual: ColunaDRE; anterior: ColunaDRE; temBase: boolean; intervalos: ColunaDRE[]; moeda: "BRL" | "MXN"; taxaMxn: number | null; rotuloIntervalo: string }) {
  const [modo, setModo] = useState<"total" | "intervalos">("total");
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const [verPct, setVerPct] = useState(true);
  const [verVar, setVerVar] = useState(true);
  const [ocultas, setOcultas] = useState<Record<string, boolean>>({});

  const colunas = modo === "total" ? [props.atual] : props.intervalos;
  const linhasBase = props.atual.linhas;
  const money = (v: number) => fmtMoeda(v, props.moeda, props.taxaMxn);
  const anteriorPor = useMemo(() => new Map(props.anterior.linhas.flatMap((l) => [[l.chave, l], ...(l.filhos ?? []).map((f) => [f.chave, f] as const)] as const)), [props.anterior]);

  function csv() {
    const cab = ["Linha", ...colunas.map((c) => c.rotulo)];
    const linhas: string[][] = [];
    const add = (l: LinhaDRE, nivel: number) => {
      linhas.push([`${"  ".repeat(nivel)}${l.rotulo}`, ...colunas.map((c) => String(achar(c.linhas, l.chave)?.valor.toFixed(2) ?? ""))]);
      l.filhos?.forEach((f) => add(f, nivel + 1));
    };
    linhasBase.forEach((l) => add(l, 0));
    const txt = [cab, ...linhas].map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" })); a.download = `dre-${props.atual.chave}.csv`; a.click();
  }

  return (
    <div className="card p-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className="chip" data-ativo={modo === "total"} onClick={() => setModo("total")}>Total do período</button>
        <button type="button" className="chip" data-ativo={modo === "intervalos"} onClick={() => setModo("intervalos")}>Analisar por intervalo ({props.rotuloIntervalo}, {props.intervalos.length} colunas)</button>
        <label className="flex items-center gap-1 ml-auto"><input type="checkbox" checked={verPct} onChange={(e) => setVerPct(e.target.checked)} />% da receita líq.</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={verVar} onChange={(e) => setVerVar(e.target.checked)} />variação</label>
        <details className="relative">
          <summary className="btn cursor-pointer list-none">Colunas (linhas visíveis)</summary>
          <div className="absolute right-0 mt-1 card p-2 z-10 w-64 max-h-64 overflow-auto text-xs flex flex-col gap-1">
            {linhasBase.map((l) => <label key={l.chave} className="flex items-center gap-1"><input type="checkbox" checked={!ocultas[l.chave]} onChange={(e) => setOcultas({ ...ocultas, [l.chave]: !e.target.checked })} />{l.rotulo}</label>)}
          </div>
        </details>
        <button type="button" className="btn" onClick={csv}>Exportar CSV</button>
      </div>
      {/* celular: lista rótulo/valor do total do período */}
      <div className="md:hidden flex flex-col">
        {linhasBase.filter((l) => !ocultas[l.chave]).map((l) => {
          const a = props.temBase ? anteriorPor.get(l.chave)?.valor ?? null : null;
          const d = a == null ? null : l.valor - a;
          const pct = props.atual.receitaLiquida ? l.valor / props.atual.receitaLiquida : null;
          return (
            <div key={l.chave} className={`flex items-start justify-between gap-3 py-2 border-b border-border last:border-b-0 ${l.destaque ? "font-bold" : ""} ${l.informativo ? "text-ink-3 italic" : ""}`}>
              <div className="min-w-0">
                <div className="text-sm">{l.rotulo}{l.extra?.qtd != null && <span className="text-ink-3 text-xs ml-1">({String(l.extra.qtd)})</span>}</div>
                {l.filhos && l.filhos.length > 0 && <div className="text-xs text-ink-3 mt-0.5">{l.filhos.map((f) => `${f.rotulo}: ${money(f.valor)}`).join(" · ")}</div>}
              </div>
              <div className="text-right num shrink-0">
                <div className={l.valor < 0 && !l.informativo ? "neg" : ""}>{money(l.valor)}</div>
                <div className="text-xs text-ink-3">{verPct && !l.informativo && pct != null ? fmtPctSimples(Math.abs(pct)) : ""}{verVar && d != null ? <span className={d >= 0 ? " pos" : " neg"}> {d >= 0 ? "+" : ""}{money(d)}</span> : ""}</div>
              </div>
            </div>
          );
        })}
        {modo === "intervalos" && <p className="text-xs text-ink-3 mt-2">Colunas por intervalo: gire o celular ou use o computador.</p>}
      </div>
      <div className="overflow-x-auto hidden md:block">
        <table className="tab">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface">Linha</th>
              {colunas.map((c) => <th key={c.chave} className="text-right">{c.rotulo}</th>)}
              {modo === "total" && verVar && <th className="text-right">vs. anterior</th>}
            </tr>
          </thead>
          <tbody>
            {linhasBase.filter((l) => !ocultas[l.chave]).map((l) => {
              const temFilhos = !!l.filhos?.length;
              const aberta = abertas[l.chave];
              const render = (li: LinhaDRE, nivel: number) => (
                <tr key={li.chave} className={li.destaque ? "tr-destaque" : li.informativo ? "tr-info" : ""}>
                  <td className="sticky left-0 bg-surface whitespace-nowrap" style={{ paddingLeft: 10 + nivel * 18 }}>
                    {nivel === 0 && temFilhos ? <button type="button" className="mr-1 text-ink-3" onClick={() => setAbertas({ ...abertas, [l.chave]: !aberta })} aria-label="expandir">{aberta ? "▾" : "▸"}</button> : nivel === 0 ? <span className="mr-1 inline-block w-3" /> : null}
                    {li.rotulo}
                    {li.extra?.qtd != null && <span className="text-ink-3 text-xs ml-1">({String(li.extra.qtd)})</span>}
                    {li.extra?.mxn != null && <span className="text-ink-3 text-xs ml-1">MX$ {Number(li.extra.mxn).toFixed(2)}</span>}
                  </td>
                  {colunas.map((c) => {
                    const x = achar(c.linhas, li.chave);
                    const v = x?.valor ?? 0;
                    const pct = c.receitaLiquida ? v / c.receitaLiquida : null;
                    const antCol = modo === "total" ? anteriorPor.get(li.chave) : null;
                    return (
                      <td key={c.chave} className="text-right num whitespace-nowrap">
                        <div className={v < 0 && !li.informativo ? "text-neg" : ""}>{money(v)}</div>
                        {verPct && !li.informativo && <div className="text-xs text-ink-3">{pct == null ? "—" : fmtPctSimples(Math.abs(pct))}</div>}
                        {modo === "intervalos" && verVar && antCol && <div className="text-xs text-ink-3">{fmtPct(antCol.valor ? (v - antCol.valor) / Math.abs(antCol.valor) : null)}</div>}
                      </td>
                    );
                  })}
                  {modo === "total" && verVar && (() => {
                    const a = props.temBase ? anteriorPor.get(li.chave)?.valor ?? null : null;
                    const v = achar(props.atual.linhas, li.chave)?.valor ?? 0;
                    if (a == null) return <td className="text-right text-xs text-ink-3">sem base</td>;
                    const d = v - a;
                    return <td className="text-right num text-xs whitespace-nowrap"><span className={d >= 0 ? "text-pos" : "text-neg"}>{d >= 0 ? "+" : ""}{money(d)} {a ? `(${fmtPct(d / Math.abs(a))})` : ""}</span></td>;
                  })()}
                </tr>
              );
              return [render(l, 0), ...(aberta && l.filhos ? l.filhos.map((f) => render(f, 1)) : [])];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function achar(linhas: LinhaDRE[], chave: string): LinhaDRE | undefined {
  for (const l of linhas) { if (l.chave === chave) return l; const f = l.filhos?.find((x) => x.chave === chave); if (f) return f; }
  return undefined;
}
