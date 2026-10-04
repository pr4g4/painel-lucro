"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { Atalho } from "@/lib/calculo";
import { ROTULO_ATALHO } from "@/lib/calculo";
import { queryDe } from "@/lib/periodo-url";

const ATALHOS: Atalho[] = ["marco_zero", "hoje", "ultimas_6h", "ultimas_24h", "ontem", "7_dias", "mes_atual", "tudo"];

export function SeletorPeriodo(props: {
  atalho: Atalho; deLocal: string; ateLocal: string; tz: string; incluirHistorico: boolean; incluirManuais: boolean; moeda: "BRL" | "MXN";
  rotuloPeriodo: string; rotuloAnterior: string; gran: "hora" | "dia"; granManual: boolean; podeSalvar: boolean;
}) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [, start] = useTransition();
  const [de, setDe] = useState(props.deLocal); const [ate, setAte] = useState(props.ateLocal);
  const [abrir, setAbrir] = useState(props.atalho === "personalizado");
  const [opcoes, setOpcoes] = useState(false);

  const ir = (q: string) => start(() => router.push(`${pathname}?${q}`));
  const base = new URLSearchParams(sp.toString());

  return (
    <div className="card p-3 flex flex-col gap-2">
      <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
        {ATALHOS.map((a) => (
          <button key={a} type="button" className="chip" data-ativo={props.atalho === a} onClick={() => ir(queryDe({ atalho: a }, base))}>{ROTULO_ATALHO[a]}</button>
        ))}
        <button type="button" className="chip" data-ativo={props.atalho === "personalizado"} onClick={() => setAbrir((v) => !v)}>Personalizado</button>
      </div>
      {abrir && (
        <form className="flex flex-wrap items-end gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); ir(queryDe({ de, ate }, base)); }}>
          <label>Início<br /><input type="datetime-local" value={de} onChange={(e) => setDe(e.target.value)} required /></label>
          <label>Fim<br /><input type="datetime-local" value={ate} onChange={(e) => setAte(e.target.value)} required /></label>
          <button className="btn btn-primary">Aplicar</button>
        </form>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
        <span><b className="text-ink">{props.rotuloPeriodo}</b> · fuso {props.tz === "America/Mexico_City" ? "México" : "Brasília"}</span>
        <span className="text-xs">vs. anterior: {props.rotuloAnterior}</span>
        <div className="md:hidden w-full"><button type="button" className="btn w-full justify-center" aria-expanded={opcoes} onClick={() => setOpcoes((v) => !v)}>{opcoes ? "Ocultar opções" : "Opções (fuso, moeda, histórico, link)"}</button></div>
        <span className={`${opcoes ? "flex" : "hidden"} md:flex md:ml-auto flex-wrap items-center gap-2`}>
          <select value={props.tz} onChange={(e) => ir(queryDe({ tz: e.target.value }, base))} aria-label="Fuso horário">
            <option value="America/Sao_Paulo">Brasília</option><option value="America/Mexico_City">México</option>
          </select>
          <select value={props.moeda} onChange={(e) => ir(queryDe({ moeda: e.target.value as "BRL" | "MXN" }, base))} aria-label="Moeda">
            <option value="BRL">R$ BRL</option><option value="MXN">MX$ MXN</option>
          </select>
          <select value={props.granManual ? props.gran : "auto"} onChange={(e) => { const q = new URLSearchParams(base); e.target.value === "auto" ? q.delete("gran") : q.set("gran", e.target.value); ir(q.toString()); }} aria-label="Granularidade">
            <option value="auto">Gráfico: automático ({props.gran})</option><option value="hora">por hora</option><option value="dia">por dia</option>
          </select>
          <label className="flex items-center gap-1"><input type="checkbox" checked={props.incluirHistorico} onChange={(e) => ir(queryDe({ incluirHistorico: e.target.checked }, base))} />Incluir histórico</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={props.incluirManuais} onChange={(e) => ir(queryDe({ incluirManuais: e.target.checked }, base))} />Incluir lançamentos manuais</label>
          <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(location.href)} title="Copiar link com o período">Copiar link</button>
          {props.podeSalvar && <SalvarVisao query={sp.toString()} />}
        </span>
      </div>
    </div>
  );
}

function SalvarVisao({ query }: { query: string }) {
  const [nome, setNome] = useState("");
  return (
    <form action="/api/visoes" method="post" className="flex items-center gap-1" onSubmit={async (e) => { e.preventDefault(); if (!nome) return; await fetch("/api/visoes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome, query }) }); setNome(""); location.reload(); }}>
      <input placeholder="nome da visão" value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" />
      <button className="btn">Salvar visão</button>
    </form>
  );
}
