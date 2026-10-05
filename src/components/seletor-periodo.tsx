"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fecha = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setOpcoes(false); };
    document.addEventListener("click", fecha); return () => document.removeEventListener("click", fecha);
  }, []);
  const ir = (q: string) => start(() => router.push(`${pathname}?${q}`));
  const base = new URLSearchParams(sp.toString());

  return (
    <div className="seletor">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1" style={{ scrollbarWidth: "none" }}>
        {ATALHOS.map((a) => <button key={a} type="button" className="chip" data-ativo={props.atalho === a} onClick={() => ir(queryDe({ atalho: a }, base))}>{ROTULO_ATALHO[a]}</button>)}
        <button type="button" className="chip" data-ativo={props.atalho === "personalizado"} onClick={() => setAbrir((v) => !v)}>Personalizado</button>
      </div>
      {abrir && (
        <form className="flex flex-wrap items-end gap-2 text-sm mt-2" onSubmit={(e) => { e.preventDefault(); ir(queryDe({ de, ate }, base)); }}>
          <label>Início<br /><input type="datetime-local" value={de} onChange={(e) => setDe(e.target.value)} required /></label>
          <label>Fim<br /><input type="datetime-local" value={ate} onChange={(e) => setAte(e.target.value)} required /></label>
          <button className="btn btn-primary">Aplicar</button>
        </form>
      )}
      <div className="flex items-center justify-between gap-3 mt-1.5">
        <div className="text-xs text-ink-3 num min-w-0">{props.rotuloPeriodo} · fuso {props.tz === "America/Mexico_City" ? "México" : "Brasília"}<span className="hidden sm:inline"> · vs. anterior {props.rotuloAnterior}</span></div>
        <div className="relative shrink-0" ref={popRef}>
          <button type="button" className="btn btn-mini" aria-expanded={opcoes} onClick={() => setOpcoes((v) => !v)}>Opções ▾</button>
          {opcoes && (
            <div className="popover">
              <label className="pop-linha">Fuso<select value={props.tz} onChange={(e) => ir(queryDe({ tz: e.target.value }, base))}><option value="America/Sao_Paulo">Brasília</option><option value="America/Mexico_City">México</option></select></label>
              <label className="pop-linha">Moeda<select value={props.moeda} onChange={(e) => ir(queryDe({ moeda: e.target.value as "BRL" | "MXN" }, base))}><option value="BRL">R$ BRL</option><option value="MXN">MX$ MXN</option></select></label>
              <label className="pop-linha">Gráfico<select value={props.granManual ? props.gran : "auto"} onChange={(e) => { const q = new URLSearchParams(base); if (e.target.value === "auto") q.delete("gran"); else q.set("gran", e.target.value); ir(q.toString()); }}><option value="auto">automático ({props.gran})</option><option value="hora">por hora</option><option value="dia">por dia</option></select></label>
              <label className="pop-linha"><span>Incluir histórico</span><input type="checkbox" checked={props.incluirHistorico} onChange={(e) => ir(queryDe({ incluirHistorico: e.target.checked }, base))} /></label>
              <label className="pop-linha"><span>Incluir lançamentos manuais</span><input type="checkbox" checked={props.incluirManuais} onChange={(e) => ir(queryDe({ incluirManuais: e.target.checked }, base))} /></label>
              <div className="h-px bg-border my-1" />
              <button type="button" className="btn w-full justify-center" onClick={() => navigator.clipboard?.writeText(location.href)}>Copiar link do período</button>
              {props.podeSalvar && <SalvarVisao query={sp.toString()} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SalvarVisao({ query }: { query: string }) {
  const [nome, setNome] = useState("");
  return (
    <form className="flex items-center gap-1 mt-1" onSubmit={async (e) => { e.preventDefault(); if (!nome) return; await fetch("/api/visoes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome, query }) }); setNome(""); location.reload(); }}>
      <input placeholder="nome da visão" value={nome} onChange={(e) => setNome(e.target.value)} className="flex-1 min-w-0" />
      <button className="btn">Salvar visão</button>
    </form>
  );
}
