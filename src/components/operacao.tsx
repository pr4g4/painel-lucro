import type { ResultadoDRE, Parametro, LancamentoCalc, Periodo } from "@/lib/calculo";
import { faltaParaEmpatar, projecaoMes, gastoMetaPorHoraDoDia, gastoPorNumero } from "@/lib/calculo";
import { fmtMoeda, type Moeda } from "@/lib/formato";

export function BlocoOperacao(props: {
  hoje: ResultadoDRE; mes: ResultadoDRE; agora: Date; tz: string; marcoZero: Date; moeda: Moeda; taxaMxn: number | null;
  lancamentos: LancamentoCalc[]; periodo: Periodo; params: Parametro[]; incluirHistorico: boolean; rotuloPeriodo: string;
}) {
  const { hoje, mes, agora, tz, moeda, taxaMxn } = props;
  const f = faltaParaEmpatar(hoje);
  const proj = projecaoMes(mes, agora, tz, props.marcoZero);
  const horas = gastoMetaPorHoraDoDia(props.lancamentos, props.periodo, tz, props.params, props.incluirHistorico);
  const numeros = gastoPorNumero(props.lancamentos, props.periodo, props.params, props.incluirHistorico);
  const money = (v: number) => fmtMoeda(v, moeda, taxaMxn);
  const maxHora = Array.isArray(horas) ? Math.max(...horas, 0.01) : 1;
  const totalNumeros = Array.isArray(numeros) ? numeros.reduce((s, n) => s + n.gasto, 0) : 0;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Operação <span className="text-xs text-ink-3 font-normal">hoje, mês e o recorte atual</span></h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className={`card p-3 md:p-4 ${f.faltaReceita === 0 ? "card-suave" : ""}`}>
          <div className="rotulo">Falta vender hoje para empatar</div>
          <div className={`num valor ${f.faltaReceita === 0 ? "pos" : ""}`}>{f.faltaReceita === 0 ? "já está no lucro" : money(f.faltaReceita)}</div>
          <div className="text-xs text-ink-3">{f.faltaReceita === 0 ? `lucro bruto de ${money(hoje.totais.lucroBruto)}` : f.vendasNecessarias != null ? `≈ ${f.vendasNecessarias} venda(s) no ticket médio de hoje (${money(hoje.indicadores.ticketMedioLiquido ?? 0)})` : <span className="text-warn">nº de vendas indisponível: {f.motivo}</span>}</div>
        </div>
        <div className="card p-3 md:p-4">
          <div className="rotulo">Projeção de lucro líquido do mês (ritmo atual)</div>
          {"indisponivel" in proj ? <><div className="num valor">—</div><div className="text-xs text-warn">dado indisponível: {proj.indisponivel}</div></> : <>
            <div className={`num valor ${proj.lucroLiquido < 0 ? "neg" : "pos"}`}>{money(proj.lucroLiquido)}</div>
            <div className="text-xs text-ink-3">{money(mes.totais.lucroLiquido)} em {proj.diasDecorridos.toFixed(1)} dia(s) → {proj.diasConsiderados} dias desde o início do acompanhamento · receita projetada {money(proj.receitaLiquida)}</div>
          </>}
        </div>
        <div className="card p-3 md:p-4 sm:col-span-2">
          <div className="rotulo">Gasto Meta com imposto por hora do dia <span className="text-ink-3">· {props.rotuloPeriodo}</span></div>
          {Array.isArray(horas) ? <>
            <div className="barras-hora mt-2" role="img" aria-label="Gasto por hora do dia">{horas.map((v, h) => <div key={h} style={{ height: `${Math.max(2, (v / maxHora) * 100)}%` }} title={`${h}h: ${money(v)}`} />)}</div>
            <div className="barras-hora-rotulos mt-1">{horas.map((_, h) => <span key={h}>{h % 6 === 0 ? `${h}h` : ""}</span>)}</div>
            <div className="text-xs text-ink-3 mt-1">pico às {horas.indexOf(maxHora)}h ({money(maxHora)}) · total {money(horas.reduce((a, b) => a + b, 0))}</div>
          </> : <div className="text-xs text-warn mt-2">dado indisponível: {horas.indisponivel}</div>}
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="tab">
          <thead><tr><th>Número de WhatsApp</th><th className="text-right">Gasto Meta c/ imposto</th><th className="text-right">% do gasto</th><th className="text-right">Campanhas</th></tr></thead>
          <tbody>
            {Array.isArray(numeros) ? numeros.map((n) => (
              <tr key={n.numero}><td className="font-semibold">{n.numero}</td><td className="text-right num">{money(n.gasto)}</td><td className="text-right num text-ink-2">{totalNumeros ? `${(n.gasto / totalNumeros * 100).toFixed(1)}%` : "—"}</td><td className="text-right num">{n.campanhas}</td></tr>
            )) : <tr><td colSpan={4} className="text-warn text-sm">dado indisponível: {numeros.indisponivel}</td></tr>}
          </tbody>
        </table>
        <p className="text-xs text-ink-3 px-3 pb-2">Receita por número não existe na fase 1 (a Zenith não liga venda a campanha), por isso não há ROAS por número.</p>
      </div>
    </section>
  );
}
