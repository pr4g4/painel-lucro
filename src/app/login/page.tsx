import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar — Painel de Lucro" };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string }>;
}) {
  if (await usuarioAtual()) redirect("/");
  const { voltar } = await searchParams;
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold">Painel de Lucro</h1>
        <p className="mt-1 text-sm text-zinc-500">Entre com seu usuário e senha.</p>
        <FormularioLogin voltar={voltar} />
      </div>
    </main>
  );
}
