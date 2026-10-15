import { Suspense } from "react";
import { contextoPeriodo } from "@/lib/contexto";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { rotuloMetodo } from "@/lib/calculo";
import { fmtDataHora, fmtMoeda, fmtNum } from "@/lib/formato";
import type { Params } from "@/lib/periodo-url";

export const dynamic = "force-dynamic";
const STATUS: Record<string, string> = { aprovada: "aprovado", pendente: "pendente", reembolsada: "reembolsado", chargeback: "chargeback", cancelada: "cancelado" };

/** Pedidos: todas as vendas do período (pela data de aprovação; pendentes pela data do pedido), com produto, valor, moeda, forma, status e origem. */
export default async function Pedidos({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado, taxaMxn } = ctx;
  const fStatus = typeof sp.status === "string" ? sp.status : "";
  const fForma = typeof sp.forma === "string" ? sp.forma : "";
  const { inicio, fim } = estado.periodo;
  const linhas = ctx.entrada.vendas
    .filter((v) => (estado.incluirHistorico || !v.historico))
    .map((v) => ({ v, quando: v.status === "pendente" ? (v.criadaEm ?? v.aprovadaEm) : (v.status === "reembolsada" || v.status === "chargeback" ? (v.reembolsadaEm ?? v.aprovadaEm) : v.aprovadaEm), forma: rotuloMetodo(v.metodo) }))
    .filter((x) => x.quando && x.quando >= inicio && x.quando < fim)
    .filter((x) => (!fStatus || x.v.status === fStatus) && (!fForma || x.forma === fForma))
    .sort((a, b) => b.quando!.getTime() - a.quando!.getTime());
  const formas = [...new Set(ctx.entrada.vendas.map((v) => rotuloMetodo(v.metodo)))].sort();
  const totalLiq = linhas.filter((x) => x.v.status === "aprovada").reduce((s, x) => s + x.v.liquidoBrl, 0);
  return (
    <>
      <Suspense fallback={<div className="h-12 skeleton" />}><SeletorPeriodo {...ctx.propsSeletor} /></Suspense>
      <h1 className="font-semibold">Pedidos <span className="text-xs text-ink-3 font-normal">{linhas.length} no período · {linhas.filter((x) => x.v.status === "aprovada").length} aprovados = {fmtMoeda(totalLiq, estado.moeda, taxaMxn)} líquidos</span></h1>
      <form className="flex flex-wrap gap-2 text-sm items-end">
        {Object.entries(sp).filter(([k]) => !["status", "forma"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
        <label>Status<select name="status" defaultValue={fStatus} className="ml-1"><option value="">todos</option>{Object.entries(STATUS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
        <label>Forma<select name="forma" defaultValue={fForma} className="ml-1"><option value="">todas</option>{formas.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
        <button className="btn">Filtrar</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="tab">
          <thead><tr><th>Quando</th><th>Produto</th><th className="text-right">Valor</th><th className="text-right">Líquido</th><th>Forma</th><th>Status</th><th>Origem</th></tr></thead>
          <tbody>
            {linhas.map(({ v, quando, forma }) => (
              <tr key={`${v.fonte}:${v.idOrigem}`} className={v.status === "pendente" ? "text-ink-2" : v.status === "aprovada" ? "" : "text-ink-3"}>
                <td className="num whitespace-nowrap">{fmtDataHora(quando, estado.tz, "dd/MM HH:mm")}</td>
                <td>{v.produto ?? <span className="text-ink-3">—</span>}</td>
                <td className="text-right num whitespace-nowrap">{v.moeda === "MXN" ? "MX$" : v.moeda} {fmtNum(v.brutoOriginal)}</td>
                <td className="text-right num whitespace-nowrap">{v.status === "aprovada" ? fmtMoeda(v.liquidoBrl, estado.moeda, taxaMxn) : <span className="text-ink-3">{fmtMoeda(v.liquidoBrl, estado.moeda, taxaMxn)}</span>}</td>
                <td>{forma}</td>
                <td><span className={`text-xs px-1.5 py-0.5 rounded-full border border-border ${v.status === "aprovada" ? "text-pos" : v.status === "pendente" ? "text-warn" : "text-neg"}`}>{STATUS[v.status] ?? v.status}</span></td>
                <td className="text-xs text-ink-3">{v.fonte}{v.historico ? " · histórico" : ""} · {v.idOrigem}</td>
              </tr>
            ))}
            {linhas.length === 0 && <tr><td colSpan={7} className="text-ink-3">Nenhum pedido no período.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-3">Aprovados entram pela data de aprovação; pendentes pela data do pedido; reembolsos e chargebacks pela data do estorno. Sem receita por campanha: a Zenith não informa de qual campanha veio o pedido.</p>
    </>
  );
}
