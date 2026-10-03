import { and, desc, gte, lt, or, ilike, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contextoPeriodo } from "@/lib/contexto";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { fmtDataHora, fmtNum } from "@/lib/formato";
import { ROTULO_FONTE } from "@/coletores";
import type { Params } from "@/lib/periodo-url";
import { carregarManuais, carregarCambio } from "@/lib/dados";
import { valorBrlNoPeriodo } from "@/lib/calculo";

export const dynamic = "force-dynamic";
type Linha = { quando: Date; fonte: string; tipo: string; descricao: string; valorOriginal: number; moeda: string; valorBrl: number; taxa: number | null; status: string; idOrigem: string; historico: boolean };

export default async function Lancamentos({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado } = ctx;
  const fonte = typeof sp.fonte === "string" ? sp.fonte : "";
  const busca = typeof sp.q === "string" ? sp.q.trim() : "";
  const { inicio, fim } = estado.periodo;
  const linhas: Linha[] = [];

  if (!fonte || !["zenith", "manual"].includes(fonte)) {
    const ls = await db.select().from(schema.lancamentos).where(and(gte(schema.lancamentos.instante, inicio), lt(schema.lancamentos.instante, fim), fonte ? eq(schema.lancamentos.fonte, fonte) : undefined, busca ? ilike(schema.lancamentos.descricao, `%${busca}%`) : undefined)).orderBy(desc(schema.lancamentos.instante)).limit(2000);
    for (const l of ls) linhas.push({ quando: l.instante, fonte: l.fonte, tipo: `${l.tipo} (${l.granularidade})${l.estimado ? " est." : ""}`, descricao: l.descricao, valorOriginal: Number(l.valorOriginal), moeda: l.moeda, valorBrl: Number(l.valorBrl), taxa: Number(l.taxaCambio), status: "ok", idOrigem: l.idOrigem ?? l.chaveNatural, historico: l.historico });
  }
  if (!fonte || ["zenith", "manual"].includes(fonte)) {
    const vs = await db.select().from(schema.vendas).where(and(or(and(gte(schema.vendas.aprovadaEm, inicio), lt(schema.vendas.aprovadaEm, fim)), and(gte(schema.vendas.reembolsadaEm, inicio), lt(schema.vendas.reembolsadaEm, fim)), and(eq(schema.vendas.status, "pendente"), gte(schema.vendas.criadaEm, inicio), lt(schema.vendas.criadaEm, fim))), fonte ? eq(schema.vendas.fonte, fonte) : undefined, busca ? or(ilike(schema.vendas.produto, `%${busca}%`), ilike(schema.vendas.idOrigem, `%${busca}%`)) : undefined)).orderBy(desc(schema.vendas.aprovadaEm)).limit(2000);
    for (const v of vs) {
      const quando = v.aprovadaEm ?? v.criadaEm ?? v.coletadoEm;
      linhas.push({ quando, fonte: v.fonte, tipo: "venda", descricao: v.produto ?? "venda", valorOriginal: Number(v.brutoOriginal), moeda: v.moeda, valorBrl: Number(v.liquidoBrl), taxa: Number(v.taxaCambio), status: v.status, idOrigem: v.idOrigem, historico: v.historico });
      if (v.reembolsadaEm && v.reembolsadaEm >= inicio && v.reembolsadaEm < fim) linhas.push({ quando: v.reembolsadaEm, fonte: v.fonte, tipo: "reembolso", descricao: `reembolso de ${v.idOrigem}`, valorOriginal: -Number(v.brutoOriginal), moeda: v.moeda, valorBrl: -Number(v.liquidoBrl), taxa: Number(v.taxaCambio), status: v.status, idOrigem: v.idOrigem, historico: v.historico });
    }
  }
  if (!fonte || fonte === "manual") {
    const [manuais, cambio] = await Promise.all([carregarManuais(), carregarCambio()]);
    for (const m of manuais) {
      if (busca && !m.descricao.toLowerCase().includes(busca.toLowerCase())) continue;
      const r = valorBrlNoPeriodo(m, estado.periodo, estado.tz, cambio);
      if (r.brl === 0 && !r.indisponivel) continue;
      linhas.push({ quando: m.frequencia === "unica" ? m.comecaEm : inicio, fonte: "manual", tipo: `${m.tipo} ${m.frequencia}${m.frequencia !== "unica" ? " (diluído no período)" : ""}`, descricao: `${m.descricao} [${m.categoria}]`, valorOriginal: m.valor, moeda: m.moeda, valorBrl: (m.tipo === "entrada" ? 1 : -1) * r.brl, taxa: r.taxa, status: r.indisponivel ?? (m.ativo ? "ativo" : "pausado"), idOrigem: `manual#${m.id}`, historico: false });
    }
  }
  linhas.sort((a, b) => b.quando.getTime() - a.quando.getTime());

  return (
    <>
      <SeletorPeriodo {...ctx.propsSeletor} />
      <h1 className="font-semibold">Lançamentos <span className="text-xs text-ink-3 font-normal">tudo que o app leu, com fonte e data/hora · {linhas.length} linhas</span></h1>
      <form className="flex flex-wrap gap-2 text-sm items-end">
        {Object.entries(sp).filter(([k]) => !["fonte", "q"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
        <label>Fonte<select name="fonte" defaultValue={fonte} className="ml-1"><option value="">todas</option>{["meta", "zenith", "manual", "openai", "kie", "cambio"].map((f) => <option key={f} value={f}>{ROTULO_FONTE[f]}</option>)}</select></label>
        <label>Busca<input name="q" defaultValue={busca} placeholder="descrição, produto, id" className="ml-1" /></label>
        <button className="btn">Filtrar</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="tab">
          <thead><tr><th>Data/hora</th><th>Fonte</th><th>Tipo</th><th>Descrição</th><th className="text-right">Valor original</th><th className="text-right">Valor BRL</th><th className="text-right">Taxa usada</th><th>Status</th><th>Id na origem</th></tr></thead>
          <tbody>
            {linhas.slice(0, 1500).map((l, i) => (
              <tr key={i} className={l.historico ? "text-ink-3" : ""}>
                <td className="num whitespace-nowrap">{fmtDataHora(l.quando, estado.tz, "dd/MM/yy HH:mm")}{l.historico && <span className="text-xs"> hist.</span>}</td><td>{ROTULO_FONTE[l.fonte] ?? l.fonte}</td><td className="text-xs">{l.tipo}</td><td>{l.descricao}</td>
                <td className="text-right num whitespace-nowrap">{l.moeda} {fmtNum(l.valorOriginal, l.moeda === "CRED" ? 0 : 2)}</td><td className={`text-right num whitespace-nowrap ${l.valorBrl < 0 ? "text-neg" : ""}`}>{l.moeda === "CRED" ? "—" : fmtNum(l.valorBrl)}</td><td className="text-right num text-ink-2">{l.taxa == null ? "—" : l.taxa === 1 ? "1" : fmtNum(l.taxa, 4)}</td><td className="text-xs">{l.status}</td><td className="text-xs text-ink-3 max-w-[16rem] truncate" title={l.idOrigem}>{l.idOrigem}</td>
              </tr>
            ))}
            {linhas.length === 0 && <tr><td colSpan={9} className="text-ink-3">Nada no período com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
