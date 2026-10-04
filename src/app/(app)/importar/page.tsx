import { exigirSessao } from "@/lib/auth/sessao";
import { FormImportar } from "./form";
export const dynamic = "force-dynamic";
export default async function Importar() {
  const s = await exigirSessao();
  return (
    <>
      <h1 className="font-semibold">Importar vendas da Zenith (CSV) <span className="text-xs text-ink-3 font-normal">para o período anterior ao webhook</span></h1>
      <div className="card p-3 text-sm text-ink-2 flex flex-col gap-1">
        <p>Na Zenith, exporte a lista de vendas/depósitos do período (CSV). Colunas reconhecidas (nome em qualquer caixa): <code>id</code>, <code>status</code>, <code>data</code> ou <code>aprovado_em</code>, <code>reembolsado_em</code>, <code>moeda</code>, <code>bruto</code> (ou <code>valor</code>), <code>brl_estimado</code>, <code>liquido</code>, <code>reserva</code>, <code>produto</code>. Separador <code>;</code> ou <code>,</code>.</p>
        <p>Importar duas vezes não duplica (chave = fonte + id). Vendas com data anterior ao marco zero entram como histórico. Se vier <code>liquido</code> e <code>reserva</code>, usa os valores da Zenith; senão calcula pelos parâmetros (7,99% + MX$5 + 2%, reserva 10%).</p>
      </div>
      {s.papel === "edita" ? <FormImportar /> : <p className="text-sm text-ink-3">Só o perfil que edita pode importar.</p>}
    </>
  );
}
