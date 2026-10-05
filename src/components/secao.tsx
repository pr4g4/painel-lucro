"use client";
import { useEffect, useState } from "react";

/** Seção recolhível. Fechada por padrão; lembra o estado no navegador (localStorage) e abre sozinha quando a URL aponta para ela (#id). */
export function Secao({ id, titulo, resumo, abertaPadrao = false, children }: { id: string; titulo: string; resumo?: React.ReactNode; abertaPadrao?: boolean; children: React.ReactNode }) {
  const [aberta, setAberta] = useState(abertaPadrao);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`secao:${id}`);
      if (v !== null) setAberta(v === "1");
      if (location.hash === `#${id}`) { setAberta(true); setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 50); }
    } catch {}
    setPronto(true);
  }, [id]);
  const alternar = () => { const v = !aberta; setAberta(v); try { localStorage.setItem(`secao:${id}`, v ? "1" : "0"); } catch {} };
  return (
    <section className="secao" id={id} data-aberta={aberta} style={{ scrollMarginTop: 120 }}>
      <button type="button" className="secao-cab" aria-expanded={aberta} aria-controls={`${id}-corpo`} onClick={alternar}>
        <span className="secao-seta" aria-hidden>{aberta ? "▾" : "▸"}</span>
        <span className="secao-titulo">{titulo}</span>
        {!aberta && resumo && <span className="secao-resumo num">{resumo}</span>}
      </button>
      {pronto && aberta && <div className="secao-corpo" id={`${id}-corpo`}>{children}</div>}
    </section>
  );
}
