"use client";
import { useState } from "react";

export type PontoS = { rotulo: string; acumulado: number; valor: number };

/**
 * Lucro acumulado no período: linha que termina no número grande; zero tracejado; verde acima, vermelho abaixo.
 * Tocar ou passar o mouse mostra o valor do ponto mais próximo. SVG puro, sem biblioteca.
 */
export function AreaAcumulado({ pontos, rotuloFim, gran, moeda = "BRL" }: { pontos: PontoS[]; rotuloFim: string; gran: "hora" | "dia"; moeda?: "BRL" | "MXN" }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 600, H = 130, padX = 6, padY = 10;
  if (pontos.length < 2) return <div className="area-lucro text-xs text-ink-3">sem pontos suficientes para o gráfico</div>;
  const vals = [0, ...pontos.map((p) => p.acumulado)];
  const min = Math.min(...vals), max = Math.max(...vals), amp = max - min || 1;
  const n = pontos.length;
  const x = (i: number) => padX + ((i + 1) / n) * (W - 2 * padX); // o ponto i fecha o intervalo i; a origem (0) fica em x = padX
  const y = (v: number) => padY + (1 - (v - min) / amp) * (H - 2 * padY);
  const pts: [number, number][] = [[padX, y(0)], ...pontos.map((p, i) => [x(i), y(p.acumulado)] as [number, number])];
  const linha = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const zero = y(0);
  const area = `${linha} L${pts[pts.length - 1][0].toFixed(1)},${zero.toFixed(1)} L${padX},${zero.toFixed(1)} Z`;
  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda, maximumFractionDigits: 2 }).format(v);
  const escolher = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let melhor = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - px) < Math.abs(pts[melhor][0] - px)) melhor = i;
    setSel(melhor);
  };
  const p = sel != null ? pts[sel] : null;
  const ponto = sel != null && sel > 0 ? pontos[sel - 1] : null;
  const meio = pontos[Math.floor((n - 1) / 2)];
  return (
    <figure className="area-lucro">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Lucro líquido acumulado" onPointerMove={escolher} onPointerDown={escolher} onPointerLeave={() => setSel(null)}>
        <defs>
          <clipPath id="acima"><rect x="0" y="0" width={W} height={zero} /></clipPath>
          <clipPath id="abaixo"><rect x="0" y={zero} width={W} height={H - zero} /></clipPath>
          <linearGradient id="gp" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--pos)" stopOpacity=".28" /><stop offset="100%" stopColor="var(--pos)" stopOpacity=".02" /></linearGradient>
          <linearGradient id="gn" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--neg)" stopOpacity=".02" /><stop offset="100%" stopColor="var(--neg)" stopOpacity=".28" /></linearGradient>
        </defs>
        <line x1={padX} x2={W - padX} y1={zero} y2={zero} stroke="var(--text-3)" strokeDasharray="3 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#gp)" clipPath="url(#acima)" />
        <path d={area} fill="url(#gn)" clipPath="url(#abaixo)" />
        <path d={linha} fill="none" stroke="var(--pos)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath="url(#acima)" />
        <path d={linha} fill="none" stroke="var(--neg)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath="url(#abaixo)" />
        {p && <line x1={p[0]} x2={p[0]} y1={padY} y2={H - padY} stroke="var(--text-3)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill={pontos[n - 1].acumulado >= 0 ? "var(--pos)" : "var(--neg)"} vectorEffect="non-scaling-stroke" />
        {p && <circle cx={p[0]} cy={p[1]} r="4" fill="var(--surface)" stroke={(sel && sel > 0 ? pontos[sel - 1].acumulado : 0) >= 0 ? "var(--pos)" : "var(--neg)"} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </svg>
      <figcaption className="flex justify-between text-xs text-ink-3 num">
        <span>{gran === "hora" ? "00h" : pontos[0].rotulo}</span>
        <span className="text-ink-2">{ponto ? <>{gran === "hora" ? `até ${ponto.rotulo.replace("h", "")}:59` : ponto.rotulo} · acumulado <b className={ponto.acumulado >= 0 ? "pos" : "neg"}>{fmt(ponto.acumulado)}</b> · no ponto {fmt(ponto.valor)}</> : sel === 0 ? "início · R$ 0,00" : `lucro acumulado por ${gran}${gran === "dia" ? ` · ${meio.rotulo}` : ""}`}</span>
        <span>{rotuloFim}</span>
      </figcaption>
    </figure>
  );
}
