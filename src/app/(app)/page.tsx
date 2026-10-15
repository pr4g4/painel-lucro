import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { MARCO_ZERO, formatarDataHora } from "@/lib/tempo";

export const dynamic = "force-dynamic";

export default async function PaginaInicial() {
  const parametros = await db
    .select()
    .from(schema.parametros)
    .where(isNull(schema.parametros.vigenciaFim))
    .orderBy(schema.parametros.chave);
  const recorrentes = await db
    .select()
    .from(schema.lancamentosManuais)
    .where(and(eq(schema.lancamentosManuais.status, "ativo")));

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Passo 2 concluído: banco, marco zero, parâmetros e login</h1>
        <p className="text-sm text-zinc-500">
          Marco zero: {formatarDataHora(MARCO_ZERO)} (Brasília). O painel ao vivo entra no passo 6.
        </p>
      </section>
      <section>
        <h2 className="font-medium">Parâmetros vigentes</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr><th className="py-1">Chave</th><th>Valor</th><th>Vigente desde</th></tr>
          </thead>
          <tbody>
            {parametros.map((p) => (
              <tr key={p.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1 font-mono">{p.chave}</td>
                <td>{p.valor ?? p.texto}{p.moeda ? ` ${p.moeda}` : ""}</td>
                <td>{formatarDataHora(p.vigenciaInicio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="font-medium">Lançamentos recorrentes ativos</h2>
        <ul className="mt-2 text-sm">
          {recorrentes.map((r) => (
            <li key={r.id}>
              {r.descricao}: {r.moeda} {r.valor} · {r.frequencia} · desde {formatarDataHora(r.comecaEm)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
