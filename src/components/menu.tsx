"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BotaoTema } from "./tema";

export const MENU: [string, string][] = [
  ["/", "Painel"], ["/resumo", "Resumo"], ["/dre", "DRE"], ["/campanhas", "Campanhas"], ["/manuais", "Lançamentos manuais"], ["/venda-manual", "Venda manual"],
  ["/custos", "Custos por tipo"], ["/lancamentos", "Lançamentos"], ["/produtos", "Por produto"], ["/avisos", "Avisos"], ["/parametros", "Parâmetros"],
];

export function Menu({ nome, papel, avisos, sair }: { nome: string; papel: string; avisos: number; sair: () => Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setAberto(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = aberto ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [aberto]);

  const itens = MENU.map(([href, rotulo]) => {
    const ativo = pathname === href;
    return (
      <Link key={href} href={href} className={`nav-item ${ativo ? "nav-ativo" : ""}`} onClick={() => setAberto(false)}>
        {rotulo}
        {href === "/avisos" && avisos > 0 && <span className="badge">{avisos}</span>}
      </Link>
    );
  });

  return (
    <header className="topo">
      <div className="topo-inner">
        <Link href="/" className="marca">Painel de Lucro</Link>
        <nav className="nav-desktop" aria-label="Principal">{itens}</nav>
        <span className="text-xs text-ink-3 hidden xl:inline whitespace-nowrap">{nome} · {papel === "edita" ? "edita" : "só vê"}</span>
        <div className="hidden md:flex items-center gap-2"><BotaoTema /><form action={sair}><button className="btn">Sair</button></form></div>
        <div className="md:hidden ml-auto">
          <button type="button" className="btn" aria-label={aberto ? "Fechar menu" : "Abrir menu"} aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
            {aberto ? "✕" : "☰"}{!aberto && avisos > 0 && <span className="badge">{avisos}</span>}
          </button>
        </div>
      </div>
      {aberto && (
        <div className="gaveta md:hidden" role="dialog" aria-label="Menu">
          <nav className="gaveta-lista" aria-label="Principal (celular)">{itens}</nav>
          <div className="gaveta-rodape">
            <span className="text-sm text-ink-2">{nome} · {papel === "edita" ? "edita" : "só vê"}</span>
            <BotaoTema />
            <form action={sair}><button className="btn">Sair</button></form>
          </div>
        </div>
      )}
    </header>
  );
}
