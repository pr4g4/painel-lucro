"use client";
import { useEffect, useState } from "react";
import { EntretemConteudo } from "./entretem";

/** Esqueleto no formato exato da inicial. Passou de 3 s: mini gráfico de barras montando em loop + frases; 12 s: aviso e "Tentar de novo". */
export function CarregandoInicial() {
  const [seg, setSeg] = useState(0);
  useEffect(() => { const t0 = Date.now(); const t = setInterval(() => setSeg((Date.now() - t0) / 1000), 500); return () => clearInterval(t); }, []);
  const demorando = seg >= 3;
  return (
    <div className="inicial" aria-busy="true" aria-label="Carregando">
      <div className="chips-linha">{[72, 72, 80, 70].map((w, i) => <div key={i} className="skeleton" style={{ width: w, height: 36, borderRadius: 999 }} />)}</div>
      <section className="hero-ini">
        {demorando ? <EntretemConteudo segundos={seg} /> : (
          <>
            <div className="skeleton" style={{ width: 220, height: 14 }} />
            <div className="skeleton" style={{ width: 260, height: 52, marginTop: 8 }} />
            <div className="skeleton" style={{ width: 300, height: 14, marginTop: 10 }} />
          </>
        )}
      </section>
      <div className="status-linha"><span className="skeleton" style={{ width: 160, height: 12 }} /></div>
      <section className="blocos">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="bloco"><div className="skeleton" style={{ width: 90, height: 11 }} /><div className="skeleton" style={{ width: 110, height: 24, marginTop: 6 }} /><div className="skeleton" style={{ width: 120, height: 11, marginTop: 6 }} /></div>)}</section>
      <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
    </div>
  );
}
