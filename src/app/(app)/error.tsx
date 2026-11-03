"use client";
import { useEffect, useState } from "react";
import { CarregandoInicial } from "@/components/carregando-inicial";
import { lerUltimoBom } from "@/components/ultimo-bom";

const g = globalThis as unknown as { __tentativasPagina?: Map<string, number> };
const tentativas = () => (g.__tentativasPagina ??= new Map<string, number>());
const MAX = 2; // tenta sozinho 2 vezes antes de mostrar o erro

/** Falhou ao carregar: tenta de novo sozinho até 2 vezes (mantendo o esqueleto); depois mostra os últimos dados salvos e "Tentar de novo". */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const chave = typeof location !== "undefined" ? location.pathname + location.search : "";
  const [repetindo, setRepetindo] = useState(() => (tentativas().get(chave) ?? 0) < MAX);
  const ultimo = lerUltimoBom();
  useEffect(() => {
    const n = tentativas().get(chave) ?? 0;
    if (n >= MAX) { setRepetindo(false); return; }
    tentativas().set(chave, n + 1);
    const t = setTimeout(() => reset(), 600 * (n + 1));
    const limpa = setTimeout(() => tentativas().delete(chave), 90_000);
    return () => { clearTimeout(t); clearTimeout(limpa); };
  }, [chave, reset]);
  if (repetindo) return <CarregandoInicial />;
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4 flex flex-col gap-2">
        <h1 className="font-semibold">Dado indisponível</h1>
        <p className="text-sm text-ink-2">Tentei 3 vezes e o banco não respondeu a tempo{error.digest ? ` (código ${error.digest})` : ""}.</p>
        <div><button className="btn btn-primary" onClick={() => { tentativas().delete(chave); reset(); }}>Tentar de novo</button></div>
      </div>
      {ultimo && (
        <section className="card p-4">
          <div className="text-xs text-ink-3 mb-2">Últimos dados salvos neste aparelho · {ultimo.quando} · {ultimo.periodo}</div>
          <div className={`hero-v num ${ultimo.lucro < 0 ? "neg" : "pos"}`} style={{ fontSize: "2.25rem" }}>{ultimo.lucroTexto}</div>
          <div className="text-sm text-ink-2 num mt-2">{ultimo.itens.map((i) => `${i.k} ${i.v}`).join(" · ")}</div>
        </section>
      )}
    </div>
  );
}
