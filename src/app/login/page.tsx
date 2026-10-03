import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth/sessao";
import { FormLogin } from "./form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ volta?: string }> }) {
  const s = await getSessao();
  if (s.usuarioId) redirect("/");
  const { volta } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold mb-1">Painel de Lucro</h1>
        <p className="text-sm text-ink-2 mb-5">Entre com seu usuário e senha.</p>
        <FormLogin volta={volta ?? "/"} />
      </div>
    </main>
  );
}
