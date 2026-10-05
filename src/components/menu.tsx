"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BotaoTema } from "./tema";

export type Grupo = { rotulo: string; icone: string; itens: [string, string][] };
export const GRUPOS: Grupo[] = [
  { rotulo: "Visão geral", icone: "◎", itens: [["/", "Painel"], ["/resumo", "Resumo (simples)"]] },
  { rotulo: "Resultados", icone: "▤", itens: [["/dre", "DRE"], ["/custos", "Custos por tipo"], ["/produtos", "Por produto"]] },
  { rotulo: "Campanhas", icone: "◍", itens: [["/campanhas", "Campanhas"]] },
  { rotulo: "Dados", icone: "⊞", itens: [["/lancamentos", "Lançamentos"], ["/manuais", "Lançamentos manuais"], ["/venda-manual", "Venda manual"], ["/importar", "Importar CSV"]] },
];
const AVISOS: [string, string] = ["/avisos", "Avisos"];
const PARAMETROS: [string, string] = ["/parametros", "Parâmetros"];

export function Menu({ nome, papel, avisos, sair }: { nome: string; papel: string; avisos: number; sair: () => Promise<void> }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState<string | null>(null); // grupo aberto (desktop popover / celular folha)
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setAberto(null); }, [pathname]);
  useEffect(() => {
    const fecha = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(null); };
    document.addEventListener("click", fecha); return () => document.removeEventListener("click", fecha);
  }, []);
  const ativo = (g: Grupo) => g.itens.some(([h]) => h === pathname);
  const item = ([href, rotulo]: [string, string]) => <Link key={href} href={href} prefetch={false} className={`nav-sub ${pathname === href ? "nav-ativo" : ""}`}>{rotulo}</Link>;

  return (
    <div ref={ref} className="contents">
      <header className="topo">
        <div className="topo-inner">
          <Link href="/" prefetch={false} className="marca">Painel de Lucro</Link>
          <nav className="nav-desktop" aria-label="Principal">
            {GRUPOS.map((g) => g.itens.length === 1 ? (
              <Link key={g.rotulo} href={g.itens[0][0]} prefetch={false} className={`nav-item ${ativo(g) ? "nav-ativo" : ""}`}>{g.rotulo}</Link>
            ) : (
              <div key={g.rotulo} className="nav-grupo">
                <button type="button" className={`nav-item ${ativo(g) ? "nav-ativo" : ""}`} aria-expanded={aberto === g.rotulo} onClick={() => setAberto(aberto === g.rotulo ? null : g.rotulo)}>
                  {g.rotulo}<span className="text-ink-3 ml-1">▾</span>
                </button>
                {aberto === g.rotulo && <div className="nav-pop">{g.itens.map(item)}</div>}
              </div>
            ))}
            <Link href={AVISOS[0]} prefetch={false} className={`nav-item ${pathname === AVISOS[0] ? "nav-ativo" : ""}`}>Avisos{avisos > 0 && <span className="badge">{avisos}</span>}</Link>
            <Link href={PARAMETROS[0]} prefetch={false} className={`nav-item ${pathname === PARAMETROS[0] ? "nav-ativo" : ""}`} title="Parâmetros" aria-label="Parâmetros">⚙</Link>
          </nav>
          <span className="text-xs text-ink-3 hidden xl:inline whitespace-nowrap">{nome} · {papel === "edita" ? "edita" : "só vê"}</span>
          <div className="hidden md:flex items-center gap-2"><BotaoTema /><form action={sair}><button className="btn">Sair</button></form></div>
        </div>
      </header>

      {/* celular: barra inferior com 4 ícones; grupos abrem uma folha */}
      <nav className="barra-inferior md:hidden" aria-label="Principal (celular)">
        {GRUPOS.slice(0, 3).map((g) => (
          g.itens.length === 1 ? (
            <Link key={g.rotulo} href={g.itens[0][0]} prefetch={false} className={`bi-item ${ativo(g) ? "nav-ativo" : ""}`}><span className="bi-icone">{g.icone}</span><span>{g.rotulo}</span></Link>
          ) : (
          <button key={g.rotulo} type="button" className={`bi-item ${ativo(g) ? "nav-ativo" : ""}`} onClick={() => setAberto(aberto === g.rotulo ? null : g.rotulo)}>
            <span className="bi-icone">{g.icone}</span><span>{g.rotulo}</span>
          </button>
          )
        ))}
        <button type="button" className={`bi-item ${aberto === "mais" ? "nav-ativo" : ""}`} onClick={() => setAberto(aberto === "mais" ? null : "mais")}>
          <span className="bi-icone">☰{avisos > 0 && <span className="badge">{avisos}</span>}</span><span>Mais</span>
        </button>
      </nav>
      {aberto && (
        <div className="folha md:hidden" role="dialog" aria-label={aberto}>
          <div className="folha-inner">
            <div className="flex items-center justify-between mb-2"><b>{aberto === "mais" ? "Mais" : aberto}</b><button type="button" className="btn" onClick={() => setAberto(null)}>Fechar</button></div>
            <div className="flex flex-col gap-1">
              {aberto === "mais" ? (
                <>
                  {GRUPOS[3].itens.map(item)}
                  <div className="h-px bg-border my-1" />
                  {item(AVISOS)}{item(PARAMETROS)}
                  <div className="flex items-center gap-2 mt-2"><span className="text-xs text-ink-3 flex-1">{nome} · {papel === "edita" ? "edita" : "só vê"}</span><BotaoTema /><form action={sair}><button className="btn">Sair</button></form></div>
                </>
              ) : GRUPOS.find((g) => g.rotulo === aberto)?.itens.map(item)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
