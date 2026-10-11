"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Atalho } from "@/lib/calculo";
import { ROTULO_ATALHO } from "@/lib/calculo";
import { queryDe } from "@/lib/periodo-url";

const VISIVEIS: Atalho[] = ["hoje", "ontem", "7_dias"];
const NO_MAIS: Atalho[] = ["ultimas_6h", "ultimas_24h", "mes_atual", "marco_zero", "tudo"];

/** Seletor compacto da página inicial: Hoje · Ontem · 7 dias à vista; o resto em "Mais". Ignora cliques repetidos enquanto carrega. */
export function SeletorCompacto(props: { atalho: Atalho; deLocal: string; ateLocal: string; tz: string; moeda: "BRL" | "MXN"; incluirHistorico: boolean; incluirManuais: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const [carregando, start] = useTransition();
  const [alvo, setAlvo] = useState<string | null>(null);
  const [mais, setMais] = useState(false);
  const [de, setDe] = useState(props.deLocal); const [ate, setAte] = useState(props.ateLocal);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fecha = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMais(false); };
    document.addEventListener("click", fecha); return () => document.removeEventListener("click", fecha);
  }, []);
  useEffect(() => { if (!carregando) setAlvo(null); document.body.toggleAttribute("data-carregando", carregando); return () => document.body.removeAttribute("data-carregando"); }, [carregando]);
  const base = new URLSearchParams(sp.toString());
  const ir = (q: string, ficha?: string) => { if (carregando) return; setAlvo(ficha ?? "mais"); setMais(false); start(() => router.push(`${pathname}?${q}`)); };
  const chip = (a: Atalho) => <button key={a} type="button" className="chip chip-sm" data-ativo={props.atalho === a} data-carregando={alvo === a} aria-busy={alvo === a} disabled={carregando} onClick={() => ir(queryDe({ atalho: a }, base), a)}>{alvo === a && <span className="girando" aria-hidden />}{ROTULO_ATALHO[a]}</button>;
  const noMais = !VISIVEIS.includes(props.atalho);
  return (
    <div className="seletor seletor-compacto" ref={ref} aria-busy={carregando}>
      {carregando && <div className="carregando-faixa" role="status">Carregando…</div>}
      <div className="chips-linha">
        {VISIVEIS.map(chip)}
        <button type="button" className="chip chip-sm" data-ativo={noMais} data-carregando={alvo === "mais"} aria-expanded={mais} disabled={carregando} onClick={() => setMais((v) => !v)}>{alvo === "mais" && <span className="girando" aria-hidden />}{noMais ? ROTULO_ATALHO[props.atalho] : "Mais"} ▾</button>
      </div>
      {mais && (
        <div className="popover popover-esq">
          <div className="flex flex-wrap gap-1.5 mb-1">{NO_MAIS.map(chip)}</div>
          <form className="flex flex-wrap items-end gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); ir(queryDe({ de, ate }, base)); }}>
            <label className="text-xs text-ink-2">Início<br /><input type="datetime-local" value={de} onChange={(e) => setDe(e.target.value)} required /></label>
            <label className="text-xs text-ink-2">Fim<br /><input type="datetime-local" value={ate} onChange={(e) => setAte(e.target.value)} required /></label>
            <button className="btn btn-primary btn-mini">Aplicar</button>
          </form>
          <div className="h-px bg-border my-1" />
          <label className="pop-linha">Fuso<select value={props.tz} onChange={(e) => ir(queryDe({ tz: e.target.value }, base))}><option value="America/Sao_Paulo">Brasília</option><option value="America/Mexico_City">México</option></select></label>
          <label className="pop-linha">Moeda<select value={props.moeda} onChange={(e) => ir(queryDe({ moeda: e.target.value as "BRL" | "MXN" }, base))}><option value="BRL">R$ BRL</option><option value="MXN">MX$ MXN</option></select></label>
          <label className="pop-linha"><span>Incluir histórico</span><input type="checkbox" checked={props.incluirHistorico} onChange={(e) => ir(queryDe({ incluirHistorico: e.target.checked }, base))} /></label>
          <label className="pop-linha"><span>Incluir lançamentos manuais</span><input type="checkbox" checked={props.incluirManuais} onChange={(e) => ir(queryDe({ incluirManuais: e.target.checked }, base))} /></label>
        </div>
      )}
    </div>
  );
}
