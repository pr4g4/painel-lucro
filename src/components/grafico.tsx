"use client";
import { Bar, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { useState } from "react";

export type PontoGrafico = { rotulo: string; receita: number; meta: number; zapdata: number; ia: number; operacao: number; lucro: number };

const SERIES = [
  ["receita", "Receita líquida", "var(--s1)"], ["meta", "Meta c/ imposto", "var(--s2)"], ["zapdata", "ZapData", "var(--s3)"], ["ia", "IA", "var(--s4)"], ["operacao", "Operação", "var(--s5)"],
] as const;

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function Grafico({ dados, titulo }: { dados: PontoGrafico[]; titulo: string }) {
  const [mm, setMm] = useState(false);
  const serie = mm ? mediaMovel(dados) : dados;
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-sm">{titulo}</h2>
        <label className="text-xs flex items-center gap-1 text-ink-2"><input type="checkbox" checked={mm} onChange={(e) => setMm(e.target.checked)} />média móvel (3)</label>
      </div>
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "var(--text-2)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-2)" }} tickLine={false} axisLine={false} tickFormatter={fmt} width={76} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} itemStyle={{ color: "var(--text-2)" }} formatter={(v) => fmt(Number(v))} cursor={{ fill: "var(--surface-2)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="receita" name="Receita líquida" fill="var(--s1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            {SERIES.slice(1).map(([k, nome, cor], i, arr) => (
              <Bar key={k} dataKey={k} name={nome} stackId="custos" fill={cor} stroke="var(--surface)" strokeWidth={1} radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={28} isAnimationActive={false} />
            ))}
            <Line type="monotone" dataKey="lucro" name="Lucro líquido" stroke="var(--s6)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: "var(--surface)" }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function mediaMovel(d: PontoGrafico[]): PontoGrafico[] {
  return d.map((p, i) => {
    const jan = d.slice(Math.max(0, i - 2), i + 1);
    const m = (k: keyof PontoGrafico) => jan.reduce((s, x) => s + (x[k] as number), 0) / jan.length;
    return { ...p, receita: m("receita"), meta: m("meta"), zapdata: m("zapdata"), ia: m("ia"), operacao: m("operacao"), lucro: m("lucro") };
  });
}
