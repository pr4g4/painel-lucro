"use client";
import { Bar, Cell, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { useState } from "react";
import { fmtBRL, fmtMXN } from "@/lib/formato";

export type PontoLucroHoraS = { rotulo: string; lucro: number; acumulado: number; meta: number; ia: number; receita: number; vendas: number };
export type VendaMarcadaS = { rotulo: string; horaRotulo: string; brutoOriginal: number; moeda: string; liquidoBrl: number; metodo: string; produto: string | null };

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function GraficoLucroHora({ pontos, vendas, fuso }: { pontos: PontoLucroHoraS[]; vendas: VendaMarcadaS[]; fuso: string }) {
  const [custos, setCustos] = useState(false);
  const porHora = new Map<string, VendaMarcadaS[]>();
  for (const v of vendas) porHora.set(v.horaRotulo, [...(porHora.get(v.horaRotulo) ?? []), v]);
  const dados = pontos.map((p) => ({ ...p, metaNeg: -p.meta, iaNeg: -p.ia }));
  const pontosVenda = vendas.map((v) => ({ rotulo: v.horaRotulo, y: v.liquidoBrl, v }));
  const totalVendas = vendas.reduce((s, v) => s + v.liquidoBrl, 0);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm">Lucro líquido por hora <span className="text-ink-3 font-normal">· {vendas.length} venda(s) marcada(s) · fuso {fuso}</span></h3>
        <button type="button" className="btn btn-mini" aria-pressed={custos} onClick={() => setCustos((v) => !v)}>{custos ? "Esconder custos" : "Mostrar custos por hora (Meta e IA)"}</button>
      </div>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "var(--text-2)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={18} allowDuplicatedCategory={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-2)" }} tickLine={false} axisLine={false} tickFormatter={fmt} width={64} />
            <ReferenceLine y={0} stroke="var(--text-3)" />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = dados.find((d) => d.rotulo === label); if (!p) return null;
              const vs = porHora.get(String(label)) ?? [];
              return (
                <div className="card p-2 text-xs num" style={{ maxWidth: 260 }}>
                  <div className="font-semibold">{label}</div>
                  <div className={p.lucro < 0 ? "neg" : "pos"}>lucro líquido {fmtBRL(p.lucro)}</div>
                  <div className="text-ink-2">acumulado {fmtBRL(p.acumulado)} · receita {fmtBRL(p.receita)}</div>
                  {custos && <div className="text-ink-2">Meta {fmtBRL(p.meta)} · IA {fmtBRL(p.ia)}</div>}
                  {vs.map((v, i) => <div key={i} className="mt-1 pt-1 border-t border-border">venda {v.rotulo.slice(6)} · {v.moeda === "MXN" ? fmtMXN(v.brutoOriginal) : `${v.moeda} ${v.brutoOriginal}`} bruto · {fmtBRL(v.liquidoBrl)} líq. · {v.metodo}{v.produto ? ` · ${v.produto}` : ""}</div>)}
                </div>
              );
            }} />
            {custos && <Bar dataKey="metaNeg" name="Meta c/ imposto" stackId="custos" fill="var(--s2)" isAnimationActive={false} maxBarSize={22} />}
            {custos && <Bar dataKey="iaNeg" name="IA" stackId="custos" fill="var(--s4)" isAnimationActive={false} maxBarSize={22} />}
            <Bar dataKey="lucro" name="Lucro líquido" isAnimationActive={false} maxBarSize={22} radius={[3, 3, 0, 0]}>
              {dados.map((d, i) => <Cell key={i} fill={d.lucro >= 0 ? "var(--pos)" : "var(--neg)"} fillOpacity={custos ? 0.55 : 0.9} />)}
            </Bar>
            <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Scatter data={pontosVenda} dataKey="y" name="Vendas" fill="var(--text)" shape={(props: { cx?: number; cy?: number }) => <circle cx={props.cx} cy={props.cy} r={5} fill="var(--surface)" stroke="var(--text)" strokeWidth={2} />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-ink-3 mt-1 num">Barras: lucro líquido da hora (verde ≥ 0, vermelho &lt; 0). Linha: acumulado no período. Pontos: vendas aprovadas na hora delas (toque ou passe o mouse para ver MX$ bruto, R$ líquido e método). Vendas marcadas: {fmtBRL(totalVendas)} líquidos.</div>
    </div>
  );
}
