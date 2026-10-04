import { exigirSessao } from "@/lib/auth/sessao";
import { FormImportar } from "./form";
export const dynamic = "force-dynamic";
export default async function Importar() {
  const s = await exigirSessao();
  return (
    <>
      <h1 className="font-semibold">Importar vendas da Zenith (CSV) <span className="text-xs text-ink-3 font-normal">para o período anterior ao webhook</span></h1>
      <div className="card p-3 text-sm text-ink-2 flex flex-col gap-1">
        <p><b>Na Zenith:</b> Vendas → Conciliação em CSV → Baixar CSV, e suba o arquivo aqui sem mexer. O app reconhece o formato (id_venda, referencia, data_hora_brt, status, valor_bruto, retencao, valor_liquido…): CAPTURED vira venda aprovada na data/hora de Brasília do arquivo, PENDING vira pendente (fora da receita), <code>retencao</code> é a reserva retida (não é custo) e <code>valor_liquido</code> o líquido. Câmbio MXN→BRL: última PTAX até a data da venda (fim de semana usa a sexta).</p>
        <p>Importar duas vezes não duplica, e a mesma venda chegando depois pelo webhook também não: a chave é o <code>id_venda</code> (e a <code>referencia</code> fica guardada como id alternativo). Vendas anteriores ao marco zero entram como histórico. Um CSV genérico (id, status, data, bruto…) também é aceito.</p>
      </div>
      {s.papel === "edita" ? <FormImportar /> : <p className="text-sm text-ink-3">Só o perfil que edita pode importar.</p>}
    </>
  );
}
