import { exigirSessao } from "@/lib/auth/sessao";
import { avisosAbertos } from "@/lib/dados";
import { sair } from "@/app/login/acoes";
import { Menu } from "@/components/menu";

export const maxDuration = 60; // nunca deixar uma página pendurada por 300 s
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  const avisos = await avisosAbertos().catch(() => []);
  return (
    <div className="min-h-screen flex flex-col">
      <Menu nome={s.nome ?? ""} papel={s.papel ?? "ve"} avisos={avisos.length} sair={sair} />
      <main className="max-w-7xl w-full mx-auto p-3 md:p-4 flex flex-col gap-3 flex-1">{children}</main>
    </div>
  );
}
