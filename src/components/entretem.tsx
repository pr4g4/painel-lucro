"use client";
import { useEffect, useState } from "react";

export const FRASES = ["Somando as vendas do Zenith…", "Perguntando à Meta quanto gastou…", "Contando os créditos da kie.ai…", "Descontando os impostos…", "Quase lá…"];

/** Mini gráfico de barras montando em loop + frases que trocam a cada 1,5 s. Passou de `segundos` ≥ 12: aviso e "Tentar de novo". */
export function EntretemConteudo({ segundos }: { segundos: number }) {
  const [frase, setFrase] = useState(0);
  useEffect(() => { const f = setInterval(() => setFrase((x) => (x + 1) % FRASES.length), 1500); return () => clearInterval(f); }, []);
  return (
    <div className="entretem" role="status">
      <svg viewBox="0 0 120 48" width="120" height="48" aria-hidden>{[14, 26, 20, 34, 28, 40, 36].map((h, i) => <rect key={i} className="barra-anim" x={i * 17 + 2} width="12" y={48 - h} height={h} rx="3" style={{ animationDelay: `${i * 140}ms` }} />)}</svg>
      <div className="text-sm text-ink-2" key={frase}>{FRASES[frase]}</div>
      {segundos >= 12 && <div className="text-xs text-warn mt-1">Está demorando mais que o normal. <button type="button" className="btn btn-mini ml-1" onClick={() => location.reload()}>Tentar de novo</button></div>}
    </div>
  );
}

/**
 * Cobre o destaque quando uma troca de período/atualização passa de 3 s (o seletor avisa pelo atributo data-carregando do body).
 * Até 3 s o conteúdo antigo fica esmaecido; passou disso, entra a animação no lugar do número.
 */
export function Entretem() {
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    let t0: number | null = null; let timer: ReturnType<typeof setInterval> | null = null;
    const atualiza = () => {
      const on = document.body.hasAttribute("data-carregando");
      if (on && t0 == null) { t0 = Date.now(); timer = setInterval(() => setSeg((Date.now() - (t0 ?? Date.now())) / 1000), 500); }
      if (!on && t0 != null) { t0 = null; if (timer) clearInterval(timer); timer = null; setSeg(0); }
    };
    const mo = new MutationObserver(atualiza); mo.observe(document.body, { attributes: true, attributeFilter: ["data-carregando"] }); atualiza();
    return () => { mo.disconnect(); if (timer) clearInterval(timer); };
  }, []);
  if (seg < 3) return null;
  return <div className="entretem-cobre"><EntretemConteudo segundos={seg} /></div>;
}
