import { exigirSessao } from "@/lib/auth/sessao";
import { avisosAbertos } from "@/lib/dados";
import { sair } from "@/app/login/acoes";
import { Menu } from "@/components/menu";
import { BarraHoje } from "@/components/barra-hoje";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  const avisos = await avisosAbertos().catch(() => []);
  return (
    <div className="min-h-screen flex flex-col">
      <Menu nome={s.nome ?? ""} papel={s.papel ?? "ve"} avisos={avisos.length} sair={sair} />
      <BarraHoje />
      <main className="max-w-6xl w-full mx-auto px-4 py-4 md:py-6 flex flex-col gap-4 flex-1 pb-24 md:pb-6">{children}</main>
    </div>
  );
}
