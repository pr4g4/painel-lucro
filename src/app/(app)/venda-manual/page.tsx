import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contextoPeriodo } from "@/lib/contexto";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { fmtDataHora, fmtMoeda, fmtNum } from "@/lib/formato";
import { paraInputLocal, type Params } from "@/lib/periodo-url";
import { salvarVendaManual, excluirVendaManual } from "./acoes";

export const dynamic = "force-dynamic";

export default async function VendaManual({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado, taxaMxn, sessao } = ctx;
  const edita = sessao.papel === "edita";
  const vendas = await db.select().from(schema.vendas).where(eq(schema.vendas.fonte, "manual")).orderBy(desc(schema.vendas.aprovadaEm)).limit(200);
  return (
    <>
      <SeletorPeriodo {...ctx.propsSeletor} />
      <h1 className="font-semibold">Venda manual <span className="text-xs text-ink-3 font-normal">para venda avulsa (SPEI sem cliente) que não aparece na Zenith · origem gravada como “manual”</span></h1>
      {edita && (
        <form action={salvarVendaManual} className="card p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-sm">
          <input type="hidden" name="tz" value={estado.tz} />
          <label>Data/hora da aprovação<input type="datetime-local" name="aprovadaEm" required defaultValue={paraInputLocal(estado.agora, estado.tz)} className="w-full" /></label>
          <label>Moeda<select name="moeda" defaultValue="MXN" className="w-full"><option>MXN</option><option>BRL</option></select></label>
          <label>Valor bruto<input name="bruto" inputMode="decimal" required className="w-full" /></label>
          <label>Bruto em BRL (se MXN)<input name="brlEstimado" inputMode="decimal" placeholder="opcional: usa câmbio" className="w-full" /></label>
          <label>Taxa cobrada (moeda da venda)<input name="taxaCobrada" inputMode="decimal" placeholder="opcional: usa parâmetros" className="w-full" /></label>
          <label>Líquido recebido (moeda da venda)<input name="liquido" inputMode="decimal" placeholder="opcional" className="w-full" /></label>
          <label>Produto<input name="produto" placeholder="opcional" className="w-full" /></label>
          <label>Status<select name="status" defaultValue="aprovada" className="w-full"><option value="aprovada">aprovada</option><option value="reembolsada">reembolsada</option><option value="chargeback">chargeback</option></select></label>
          <label>Reembolsada em (se for o caso)<input type="datetime-local" name="reembolsadaEm" className="w-full" /></label>
          <label className="col-span-2">Observação<input name="observacao" className="w-full" /></label>
          <div className="flex items-end"><button className="btn btn-primary">Registrar venda</button></div>
        </form>
      )}
      <div className="card overflow-x-auto">
        <table className="tab">
          <thead><tr><th>Aprovada em</th><th>Status</th><th>Produto</th><th className="text-right">Bruto</th><th className="text-right">Taxa usada</th><th className="text-right">Líquido BRL</th><th>Obs.</th><th>Id</th>{edita && <th></th>}</tr></thead>
          <tbody>
            {vendas.map((v) => (
              <tr key={v.id}>
                <td className="num">{fmtDataHora(v.aprovadaEm, estado.tz, "dd/MM/yy HH:mm")}</td><td>{v.status}{v.reembolsadaEm && <span className="text-xs text-ink-3"> em {fmtDataHora(v.reembolsadaEm, estado.tz)}</span>}</td><td>{v.produto ?? "—"}</td>
                <td className="text-right num">{v.moeda} {fmtNum(Number(v.brutoOriginal))}</td><td className="text-right num text-ink-2">{fmtNum(Number(v.taxaCambio), 4)}</td>
                <td className="text-right num">{fmtMoeda(Number(v.liquidoBrl), estado.moeda, taxaMxn)}</td><td className="text-xs">{v.observacao}</td><td className="text-xs text-ink-3">{v.idOrigem}</td>
                {edita && <td><form action={excluirVendaManual}><input type="hidden" name="id" value={v.idOrigem} /><button className="btn">excluir</button></form></td>}
              </tr>
            ))}
            {vendas.length === 0 && <tr><td colSpan={9} className="text-ink-3">Nenhuma venda manual.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
