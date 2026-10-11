"use client";
import { useEffect, useState } from "react";
import { CarregandoInicial } from "@/components/carregando-inicial";

const g = globalThis as unknown as { __tentativasInicial?: Map<string, number> };
const tentativas = () => (g.__tentativasInicial ??= new Map<string, number>());

/** Falhou ao carregar a inicial: tenta de novo sozinho 1 vez (mantendo o carregamento na tela); só mostra o erro se falhar de novo. */
export default function ErroInicial({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const chave = `${typeof location !== "undefined" ? location.search : ""}`;
  const [repetindo, setRepetindo] = useState(() => (tentativas().get(chave) ?? 0) < 1);
  useEffect(() => {
    const n = tentativas().get(chave) ?? 0;
    if (n >= 1) { setRepetindo(false); return; }
    tentativas().set(chave, n + 1);
    const t = setTimeout(() => reset(), 400);
    const limpa = setTimeout(() => tentativas().delete(chave), 60_000); // depois de 1 min, uma nova falha ganha nova tentativa automática
    return () => { clearTimeout(t); clearTimeout(limpa); };
  }, [chave, reset]);
  if (repetindo) return <CarregandoInicial />;
  return (
    <div className="card p-4 flex flex-col gap-2">
      <h1 className="font-semibold">Dado indisponível</h1>
      <p className="text-sm text-ink-2">A página não conseguiu carregar os dados, mesmo na segunda tentativa{error.digest ? ` (código ${error.digest})` : ""}. Normalmente é o banco demorando a responder.</p>
      <div><button className="btn btn-primary" onClick={() => { tentativas().delete(chave); reset(); }}>Tentar de novo</button></div>
    </div>
  );
}
