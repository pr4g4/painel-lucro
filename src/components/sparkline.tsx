/** Minilinha SVG (sem dependência), renderizada no servidor. Verde quando o último ponto ≥ 0, vermelho quando < 0. */
export function Sparkline({ valores, largura = 160, altura = 40 }: { valores: number[]; largura?: number; altura?: number }) {
  if (valores.length < 2) return null;
  const min = Math.min(...valores, 0), max = Math.max(...valores, 0);
  const amp = max - min || 1;
  const x = (i: number) => (i / (valores.length - 1)) * (largura - 2) + 1;
  const y = (v: number) => altura - 1 - ((v - min) / amp) * (altura - 2);
  const d = valores.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const zero = y(0);
  const cor = valores[valores.length - 1] >= 0 ? "var(--pos)" : "var(--neg)";
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} className="sparkline" role="img" aria-label="Evolução no período">
      <line x1={0} x2={largura} y1={zero} y2={zero} stroke="var(--border)" strokeWidth={1} />
      <path d={d} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(valores.length - 1)} cy={y(valores[valores.length - 1])} r={3} fill={cor} />
    </svg>
  );
}
