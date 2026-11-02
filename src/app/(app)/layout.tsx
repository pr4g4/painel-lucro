import { exigirSessao } from "@/lib/auth/sessao";
import { avisosAbertos } from "@/lib/dados";
import { sair } from "@/app/login/acoes";
import { Menu } from "@/components/menu";
import { BarraHoje } from "@/components/barra-hoje";
import { SoForaDaInicial } from "@/components/so-fora-da-inicial";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  const avisos = await avisosAbertos().catch(() => []);
  return (
    <div className="min-h-screen flex flex-col">
      <Menu nome={s.nome ?? ""} papel={s.papel ?? "ve"} avisos={avisos.length} sair={sair} />
      <SoForaDaInicial><BarraHoje webhookZenithRejeitado={avisos.some((a) => a.tipo === "webhook_rejeitado")} /></SoForaDaInicial>
      {avisos.filter((a) => a.tipo === "migracao_pendente").map((a) => <div key={a.id} className="faixa-atraso faixa-atraso-compacta" role="alert">⚠ {a.mensagem} <a href="/avisos" className="underline ml-2">ver Avisos</a></div>)}
      <main className="max-w-6xl w-full mx-auto px-4 py-4 md:py-6 flex flex-col gap-4 flex-1 pb-24 md:pb-6">{children}</main>
    </div>
  );
}
