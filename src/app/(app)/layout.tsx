import { Suspense } from "react";
import { exigirSessao } from "@/lib/auth/sessao";
import { avisosAbertos } from "@/lib/dados";
import { sair } from "@/app/login/acoes";
import { Menu } from "@/components/menu";
import { BarraHoje } from "@/components/barra-hoje";
import { SoForaDaInicial } from "@/components/so-fora-da-inicial";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Casca sem banco: só a sessão (cookie). Avisos, barra Hoje e faixas chegam depois por streaming. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  return (
    <div className="min-h-screen flex flex-col">
      <Menu nome={s.nome ?? ""} papel={s.papel ?? "ve"} avisosSlot={<Suspense fallback={null}><BadgeAvisos /></Suspense>} sair={sair} />
      <Suspense fallback={<SoForaDaInicial><div className="barra-hoje"><div className="barra-hoje-inner"><span className="bh-rotulo">Hoje</span><span className="skeleton" style={{ width: 160, height: 18 }} /><span className="skeleton" style={{ width: 120, height: 18 }} /></div></div></SoForaDaInicial>}>
        <BarraEFaixas />
      </Suspense>
      <main className="max-w-6xl w-full mx-auto px-4 py-4 md:py-6 flex flex-col gap-4 flex-1 pb-24 md:pb-6">{children}</main>
    </div>
  );
}

async function BadgeAvisos() {
  const avisos = await avisosAbertos().catch(() => []);
  return avisos.length > 0 ? <span className="badge">{avisos.length}</span> : null;
}

async function BarraEFaixas() {
  const avisos = await avisosAbertos().catch(() => []);
  return (
    <>
      <SoForaDaInicial><BarraHoje webhookZenithRejeitado={avisos.some((a) => a.tipo === "webhook_rejeitado")} /></SoForaDaInicial>
      {avisos.filter((a) => a.tipo === "migracao_pendente").map((a) => <div key={a.id} className="faixa-atraso faixa-atraso-compacta" role="alert">⚠ {a.mensagem} <a href="/avisos" className="underline ml-2">ver Avisos</a></div>)}
    </>
  );
}
