import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import { acaoSair } from "@/app/login/actions";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
        <strong>Painel de Lucro</strong>
        <div className="flex items-center gap-3">
          <span className="text-zinc-500">
            {u.nome} · {u.papel === "edita" ? "edita" : "só vê"}
          </span>
          <form action={acaoSair}>
            <button className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700">Sair</button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
