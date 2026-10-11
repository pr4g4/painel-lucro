/** Gráfico pequeno de lucro por hora: área suave em SVG (servidor), sem eixos pesados. Verde/vermelho conforme o acumulado do período. */
export function AreaLucro({ pontos, rotuloInicio, rotuloFim, positivo }: { pontos: number[]; rotuloInicio: string; rotuloFim: string; positivo: boolean }) {
  const W = 600, H = 120, pad = 6;
  if (pontos.length < 2) return <div className="area-lucro text-xs text-ink-3">sem horas suficientes para o gráfico</div>;
  const min = Math.min(...pontos, 0), max = Math.max(...pontos, 0), amp = max - min || 1;
  const x = (i: number) => pad + (i / (pontos.length - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / amp) * (H - 2 * pad);
  // curva suave (Catmull-Rom → Bézier)
  const pts = pontos.map((v, i) => [x(i), y(v)] as const);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const zero = y(0);
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${zero.toFixed(1)} L${pts[0][0].toFixed(1)},${zero.toFixed(1)} Z`;
  const cor = positivo ? "var(--pos)" : "var(--neg)";
  return (
    <figure className="area-lucro">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Lucro líquido por hora">
        <defs><linearGradient id="gl" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={cor} stopOpacity=".28" /><stop offset="100%" stopColor={cor} stopOpacity="0" /></linearGradient></defs>
        <line x1={pad} x2={W - pad} y1={zero} y2={zero} stroke="var(--border)" strokeDasharray="3 4" />
        <path d={area} fill="url(#gl)" />
        <path d={d} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex justify-between text-xs text-ink-3 num"><span>{rotuloInicio}</span><span>lucro líquido por hora</span><span>{rotuloFim}</span></figcaption>
    </figure>
  );
}
