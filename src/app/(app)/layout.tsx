import Link from "next/link";
import { exigirSessao } from "@/lib/auth/sessao";
import { avisosAbertos } from "@/lib/dados";
import { BotaoTema } from "@/components/tema";
import { sair } from "@/app/login/acoes";

const MENU = [
  ["/", "Painel"], ["/dre", "DRE"], ["/campanhas", "Campanhas"], ["/manuais", "Lançamentos manuais"], ["/venda-manual", "Venda manual"],
  ["/custos", "Custos por tipo"], ["/lancamentos", "Lançamentos"], ["/produtos", "Por produto"], ["/avisos", "Avisos"], ["/parametros", "Parâmetros"],
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  const avisos = await avisosAbertos();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-surface sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 py-2 flex items-center gap-3">
          <Link href="/" className="font-semibold whitespace-nowrap">Painel de Lucro</Link>
          <nav className="flex gap-1 overflow-x-auto text-sm flex-1">
            {MENU.map(([href, rotulo]) => (
              <Link key={href} href={href} className="px-2 py-1 rounded hover:bg-surface-2 whitespace-nowrap text-ink-2">
                {rotulo}{href === "/avisos" && avisos.length > 0 && <span className="ml-1 inline-flex items-center justify-center rounded-full bg-warn text-white text-xs px-1.5">{avisos.length}</span>}
              </Link>
            ))}
          </nav>
          <span className="text-xs text-ink-3 hidden sm:inline">{s.nome} · {s.papel === "edita" ? "edita" : "só vê"}</span>
          <BotaoTema />
          <form action={sair}><button className="btn">Sair</button></form>
        </div>
      </header>
      <main className="max-w-7xl w-full mx-auto p-3 flex flex-col gap-3 flex-1">{children}</main>
    </div>
  );
}
