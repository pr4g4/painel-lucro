"use client";
import { Bar, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { fmtBRL } from "@/lib/formato";

export type PontoIAHoraS = { rotulo: string; openai: number; kie: number };
export type MarcacaoS = { rotulo: string; horaRotulo: string; texto: string };

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(v);

export function GraficoIAHora({ pontos, marcacoes, comparacao }: { pontos: PontoIAHoraS[]; marcacoes: MarcacaoS[]; comparacao: { antesPorHora: number; depoisPorHora: number; horasDepois: number; texto: string } | null }) {
  const total = pontos.reduce((s, p) => s + p.openai + p.kie, 0);
  return (
    <div>
      <h3 className="font-semibold text-sm mb-2">IA por hora <span className="text-ink-3 font-normal">· últimas 48 h · total {fmtBRL(total)} · OpenAI e kie.ai separadas</span></h3>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "var(--text-2)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-2)" }} tickLine={false} axisLine={false} tickFormatter={fmt} width={70} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} itemStyle={{ color: "var(--text-2)" }} formatter={(v) => fmt(Number(v))} cursor={{ fill: "var(--surface-2)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="openai" name="OpenAI" stackId="ia" fill="var(--s1)" isAnimationActive={false} maxBarSize={18} />
            <Bar dataKey="kie" name="kie.ai" stackId="ia" fill="var(--s4)" isAnimationActive={false} maxBarSize={18} radius={[3, 3, 0, 0]} />
            {marcacoes.map((m, i) => <ReferenceLine key={i} x={m.horaRotulo} stroke="var(--neg)" strokeDasharray="4 3" label={{ value: m.texto, position: "insideTopLeft", fontSize: 11, fill: "var(--neg)" }} />)}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {comparacao && <div className="text-xs mt-1 num"><span className="text-ink-2">Desde a marcação ({comparacao.texto}):</span> <span className={comparacao.depoisPorHora <= comparacao.antesPorHora ? "pos" : "neg"}>{fmtBRL(comparacao.depoisPorHora)}/h</span> <span className="text-ink-3">vs. {fmtBRL(comparacao.antesPorHora)}/h antes · {comparacao.horasDepois} h depois</span></div>}
    </div>
  );
}
