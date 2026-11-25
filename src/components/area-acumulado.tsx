"use client";
import { useState } from "react";

export type PontoS = { rotulo: string; acumulado: number; valor: number };

/**
 * Lucro acumulado no período: linha que termina no número grande; zero tracejado; verde acima, vermelho abaixo.
 * Tocar ou passar o mouse mostra o valor do ponto mais próximo. SVG puro, sem biblioteca.
 */
export function AreaAcumulado({ pontos, anterior = [], rotuloAnterior = "anterior", rotuloFim, gran, moeda = "BRL" }: { pontos: PontoS[]; anterior?: PontoS[]; rotuloAnterior?: string; rotuloFim: string; gran: "hora" | "dia"; moeda?: "BRL" | "MXN" }) {
  const [sel, setSel] = useState<number | null>(null);
  const [fixo, setFixo] = useState(false); // no toque, a seleção fica até o próximo toque (no iPhone não há "passar o mouse")
  const W = 600, H = 130, padX = 6, padY = 10;
  if (pontos.length < 2) return <div className="area-lucro text-xs text-ink-3">sem pontos suficientes para o gráfico</div>;
  const ant = anterior.length === pontos.length ? anterior : []; // só compara quando as duas curvas têm o mesmo número de pontos (mesma hora, ponto a ponto)
  const vals = [0, ...pontos.map((p) => p.acumulado), ...ant.map((p) => p.acumulado)];
  const min = Math.min(...vals), max = Math.max(...vals), amp = max - min || 1;
  const n = pontos.length;
  const x = (i: number) => padX + ((i + 1) / n) * (W - 2 * padX); // o ponto i fecha o intervalo i; a origem (0) fica em x = padX
  const y = (v: number) => padY + (1 - (v - min) / amp) * (H - 2 * padY);
  const pts: [number, number][] = [[padX, y(0)], ...pontos.map((p, i) => [x(i), y(p.acumulado)] as [number, number])];
  const linha = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const ptsAnt: [number, number][] = ant.length ? [[padX, y(0)], ...ant.map((p, i) => [x(i), y(p.acumulado)] as [number, number])] : [];
  const linhaAnt = ptsAnt.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const zero = y(0);
  const area = `${linha} L${pts[pts.length - 1][0].toFixed(1)},${zero.toFixed(1)} L${padX},${zero.toFixed(1)} Z`;
  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda, maximumFractionDigits: 2 }).format(v);
  const escolherEm = (clientX: number, alvo: Element) => {
    const r = alvo.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let melhor = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - px) < Math.abs(pts[melhor][0] - px)) melhor = i;
    setSel(melhor);
  };
  const escolher = (e: React.PointerEvent<SVGSVGElement>) => { if (e.pointerType === "touch") setFixo(true); escolherEm(e.clientX, e.currentTarget); };
  const sair = (e: React.PointerEvent<SVGSVGElement>) => { if (e.pointerType !== "touch" && !fixo) setSel(null); };
  const p = sel != null ? pts[sel] : null;
  const ponto = sel != null && sel > 0 ? pontos[sel - 1] : null;
  const meio = pontos[Math.floor((n - 1) / 2)];
  return (
    <figure className="area-lucro" style={{ position: "relative" }}>
      <span className="area-zero num" style={{ top: `${(zero / H) * 100}%` }}>{fmt(0)}</span>
      {ponto && p && (
        <span className={`area-dica num ${ponto.acumulado >= 0 ? "pos" : "neg"}`} style={{ left: `${(p[0] / W) * 100}%`, top: `${(p[1] / H) * 100}%`, transform: `translate(${p[0] > W * 0.7 ? "-100%" : "8px"}, ${p[1] < H * 0.35 ? "8px" : "-110%"})` }}>
          <b>{fmt(ponto.acumulado)}</b> · {gran === "hora" ? `até ${ponto.rotulo.replace("h", "")}:59` : ponto.rotulo}
          {ant.length > 0 && sel != null && sel > 0 && <span className="text-ink-3"> · {rotuloAnterior} {fmt(ant[sel - 1].acumulado)}</span>}
        </span>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Lucro líquido acumulado" onPointerMove={(e) => { if (e.pointerType !== "touch") escolher(e); }} onPointerDown={escolher} onPointerLeave={sair}>
        <defs>
          <clipPath id="acima"><rect x="0" y="0" width={W} height={zero} /></clipPath>
          <clipPath id="abaixo"><rect x="0" y={zero} width={W} height={H - zero} /></clipPath>
          <linearGradient id="gp" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--pos)" stopOpacity=".28" /><stop offset="100%" stopColor="var(--pos)" stopOpacity=".02" /></linearGradient>
          <linearGradient id="gn" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--neg)" stopOpacity=".02" /><stop offset="100%" stopColor="var(--neg)" stopOpacity=".28" /></linearGradient>
        </defs>
        <line x1={padX} x2={W - padX} y1={zero} y2={zero} stroke="var(--text-3)" strokeDasharray="3 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {linhaAnt && <path d={linhaAnt} fill="none" stroke="var(--text-3)" strokeWidth="1.8" strokeOpacity=".75" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        <path d={area} fill="url(#gp)" clipPath="url(#acima)" />
        <path d={area} fill="url(#gn)" clipPath="url(#abaixo)" />
        <path d={linha} fill="none" stroke="var(--pos)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath="url(#acima)" />
        <path d={linha} fill="none" stroke="var(--neg)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath="url(#abaixo)" />
        {p && <line x1={p[0]} x2={p[0]} y1={padY} y2={H - padY} stroke="var(--text-3)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill={pontos[n - 1].acumulado >= 0 ? "var(--pos)" : "var(--neg)"} vectorEffect="non-scaling-stroke" />
        {p && <circle cx={p[0]} cy={p[1]} r="4" fill="var(--surface)" stroke={(sel && sel > 0 ? pontos[sel - 1].acumulado : 0) >= 0 ? "var(--pos)" : "var(--neg)"} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </svg>
      {ant.length > 0 && <div className="area-legenda num"><span><i className="leg-hoje" /> agora</span><span><i className="leg-ant" /> {rotuloAnterior}</span></div>}
      <figcaption className="flex justify-between text-xs text-ink-3 num">
        <span>{gran === "hora" ? "00h" : pontos[0].rotulo}</span>
        <span className="text-ink-2">{ponto ? <>{gran === "hora" ? `até ${ponto.rotulo.replace("h", "")}:59` : ponto.rotulo} · acumulado <b className={ponto.acumulado >= 0 ? "pos" : "neg"}>{fmt(ponto.acumulado)}</b> · no ponto {fmt(ponto.valor)}</> : sel === 0 ? "início · R$ 0,00" : `lucro acumulado por ${gran}${gran === "dia" ? ` · ${meio.rotulo}` : ""}`}</span>
        <span>{rotuloFim}</span>
      </figcaption>
    </figure>
  );
}
