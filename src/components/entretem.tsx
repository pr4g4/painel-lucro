"use client";
import { useEffect, useState } from "react";

export const FRASES = ["Somando as vendas do Zenith…", "Perguntando à Meta quanto gastou…", "Contando os créditos da kie.ai…", "Descontando os impostos…", "Separando o lucro em dois…", "Quase lá…"];

/** Dois bonecos de palito brigando (SVG + CSS, sem biblioteca) com frases que trocam a cada 1,5 s. ≥ 12 s: aviso e "Tentar de novo". */
export function EntretemConteudo({ segundos }: { segundos: number }) {
  const [frase, setFrase] = useState(0);
  useEffect(() => { const f = setInterval(() => setFrase((x) => (x + 1) % FRASES.length), 1500); return () => clearInterval(f); }, []);
  return (
    <div className="entretem" role="status" aria-live="polite">
      <svg className="briga" viewBox="0 0 160 70" width="160" height="70" aria-hidden>
        <g className="boneco b1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <circle cx="40" cy="14" r="7" />
          <path d="M40 21 v22" /><path className="braco" d="M40 28 l16 -6" /><path d="M40 28 l-10 10" />
          <path className="perna" d="M40 43 l-9 18" /><path d="M40 43 l9 18" />
        </g>
        <g className="boneco b2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <circle cx="118" cy="14" r="7" />
          <path d="M118 21 v22" /><path className="braco" d="M118 28 l-16 -4" /><path d="M118 28 l10 10" />
          <path className="perna" d="M118 43 l9 18" /><path d="M118 43 l-9 18" />
        </g>
        <g className="pow" fill="var(--warn)" fontSize="9" fontWeight="700" fontFamily="ui-sans-serif, system-ui"><text x="72" y="18">POW!</text></g>
        <g className="estrelas" fill="var(--accent)"><circle cx="80" cy="8" r="1.6" /><circle cx="92" cy="26" r="1.3" /><circle cx="66" cy="30" r="1.3" /></g>
        <path d="M20 66 h120" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="text-sm text-ink-2 entretem-frase" key={frase}>{FRASES[frase]}</div>
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
