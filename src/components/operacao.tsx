import type { ResultadoDRE, Parametro, LancamentoCalc, Periodo } from "@/lib/calculo";
import { faltaParaEmpatar, projecaoMes, gastoMetaPorHoraDoDia, gastoPorNumero } from "@/lib/calculo";
import { fmtMoeda, type Moeda } from "@/lib/formato";

type Dinheiro = { moeda: Moeda; taxaMxn: number | null };
const m = (d: Dinheiro) => (v: number) => fmtMoeda(v, d.moeda, d.taxaMxn);

/** Quanto falta vender hoje para empatar (lucro bruto ≥ 0). */
export function FaltaEmpatar({ hoje, ...d }: { hoje: ResultadoDRE } & Dinheiro) {
  const f = faltaParaEmpatar(hoje); const money = m(d);
  return (
    <div className="metrica">
      <div className="metrica-k">Falta vender hoje para empatar</div>
      <div className={`metrica-v num ${f.faltaReceita === 0 ? "pos" : ""}`}>{f.faltaReceita === 0 ? "já está no lucro" : money(f.faltaReceita)}</div>
      <div className="metrica-s">{f.faltaReceita === 0 ? `lucro bruto de ${money(hoje.totais.lucroBruto)}` : f.vendasNecessarias != null ? `≈ ${f.vendasNecessarias} venda(s) no ticket médio de hoje (${money(hoje.indicadores.ticketMedioLiquido ?? 0)})` : <span className="text-warn">nº de vendas indisponível: {f.motivo}</span>}</div>
    </div>
  );
}

/** Projeção do lucro líquido do mês pelo ritmo desde o marco zero. */
export function Projecao({ mes, agora, tz, marcoZero, ...d }: { mes: ResultadoDRE; agora: Date; tz: string; marcoZero: Date } & Dinheiro) {
  const proj = projecaoMes(mes, agora, tz, marcoZero); const money = m(d);
  if ("indisponivel" in proj) return <div className="metrica"><div className="metrica-k">Projeção de lucro líquido do mês</div><div className="metrica-v num">—</div><div className="metrica-s text-warn">dado indisponível: {proj.indisponivel}</div></div>;
  return (
    <div className="metrica">
      <div className="metrica-k">Projeção de lucro líquido do mês (ritmo desde o marco zero)</div>
      <div className={`metrica-v num ${proj.lucroLiquido < 0 ? "neg" : "pos"}`}>{money(proj.lucroLiquido)}</div>
      <div className="metrica-s" style={{ whiteSpace: "normal" }}>{money(mes.totais.lucroLiquido)} em {proj.diasDecorridos.toFixed(1)} dia(s), projetado para {proj.diasConsiderados} dias · receita projetada {money(proj.receitaLiquida)}</div>
    </div>
  );
}

/** Barras de gasto Meta (com imposto) por hora do dia, no recorte atual. */
export function GastoPorHora({ lancamentos, periodo, tz, params, incluirHistorico, rotuloPeriodo, ...d }: { lancamentos: LancamentoCalc[]; periodo: Periodo; tz: string; params: Parametro[]; incluirHistorico: boolean; rotuloPeriodo: string } & Dinheiro) {
  const horas = gastoMetaPorHoraDoDia(lancamentos, periodo, tz, params, incluirHistorico); const money = m(d);
  const maxHora = Array.isArray(horas) ? Math.max(...horas, 0.01) : 1;
  return (
    <div>
      <div className="rotulo">Gasto Meta com imposto por hora do dia <span className="text-ink-3">· {rotuloPeriodo}</span></div>
      {Array.isArray(horas) ? <>
        <div className="barras-hora mt-2" role="img" aria-label="Gasto por hora do dia">{horas.map((v, h) => <div key={h} style={{ height: `${Math.max(2, (v / maxHora) * 100)}%` }} title={`${h}h: ${money(v)}`} />)}</div>
        <div className="barras-hora-rotulos mt-1">{horas.map((_, h) => <span key={h}>{h % 6 === 0 ? `${h}h` : ""}</span>)}</div>
        <div className="text-xs text-ink-3 mt-1 num">pico às {horas.indexOf(maxHora)}h ({money(maxHora)}) · total {money(horas.reduce((a, b) => a + b, 0))}</div>
      </> : <div className="text-xs text-warn mt-2">dado indisponível: {horas.indisponivel}</div>}
    </div>
  );
}

/** Gasto Meta por número de WhatsApp. */
export function TabelaNumeros({ lancamentos, periodo, params, incluirHistorico, ...d }: { lancamentos: LancamentoCalc[]; periodo: Periodo; params: Parametro[]; incluirHistorico: boolean } & Dinheiro) {
  const numeros = gastoPorNumero(lancamentos, periodo, params, incluirHistorico); const money = m(d);
  const total = Array.isArray(numeros) ? numeros.reduce((s, n) => s + n.gasto, 0) : 0;
  return (
    <div className="overflow-x-auto">
      <table className="tab">
        <thead><tr><th>Número de WhatsApp</th><th className="text-right">Gasto Meta c/ imposto</th><th className="text-right">% do gasto</th><th className="text-right">Campanhas</th></tr></thead>
        <tbody>
          {Array.isArray(numeros) ? numeros.map((n) => (
            <tr key={n.numero}><td className="font-semibold">{n.numero}</td><td className="text-right num">{money(n.gasto)}</td><td className="text-right num text-ink-2">{total ? `${(n.gasto / total * 100).toFixed(1)}%` : "—"}</td><td className="text-right num">{n.campanhas}</td></tr>
          )) : <tr><td colSpan={4} className="text-warn text-sm">dado indisponível: {numeros.indisponivel}</td></tr>}
        </tbody>
      </table>
      <p className="text-xs text-ink-3 pt-2">Receita por número não existe na fase 1 (a Zenith não liga venda a campanha), por isso não há ROAS por número.</p>
    </div>
  );
}
