"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BotaoTema } from "./tema";

/** Menu enxuto (13/11): Erick e Ian usam a inicial; o resto é só o necessário para os dados continuarem certos. */
export const ITENS: [string, string, string][] = [["/", "Início", "◎"], ["/avisos", "Avisos", "▲"], ["/importar", "Importar", "⇪"], ["/parametros", "Parâmetros", "⚙"]];

export function Menu({ nome, papel, avisosSlot, sair }: { nome: string; papel: string; avisosSlot?: React.ReactNode; sair: () => Promise<void> }) {
  const pathname = usePathname();
  const quem = <span className="text-xs text-ink-3 whitespace-nowrap">{nome} · {papel === "edita" ? "edita" : "só vê"}</span>;
  return (
    <>
      <header className="topo">
        <div className="topo-inner">
          <Link href="/" prefetch={false} className="marca">Painel de Lucro</Link>
          <nav className="nav-desktop" aria-label="Principal">
            {ITENS.map(([href, rotulo]) => <Link key={href} href={href} prefetch={false} className={`nav-item ${pathname === href ? "nav-ativo" : ""}`}>{rotulo}{href === "/avisos" ? avisosSlot : null}</Link>)}
          </nav>
          <span className="hidden xl:inline">{quem}</span>
          <div className="hidden md:flex items-center gap-2"><BotaoTema /><form action={sair}><button className="btn">Sair</button></form></div>
        </div>
      </header>
      {/* celular: barra inferior com os 4 itens; tema e sair ficam em Parâmetros */}
      <nav className="barra-inferior md:hidden" aria-label="Principal (celular)">
        {ITENS.map(([href, rotulo, icone]) => (
          <Link key={href} href={href} prefetch={false} className={`bi-item ${pathname === href ? "nav-ativo" : ""}`}><span className="bi-icone">{icone}{href === "/avisos" ? avisosSlot : null}</span><span>{rotulo}</span></Link>
        ))}
      </nav>
      {pathname === "/parametros" && <div className="md:hidden flex items-center gap-2 px-4 pt-3">{quem}<span className="flex-1" /><BotaoTema /><form action={sair}><button className="btn">Sair</button></form></div>}
    </>
  );
}
