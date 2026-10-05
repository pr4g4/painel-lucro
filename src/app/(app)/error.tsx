"use client";
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card p-4 flex flex-col gap-2">
      <h1 className="font-semibold">Dado indisponível</h1>
      <p className="text-sm text-ink-2">A página não conseguiu carregar os dados{error.digest ? ` (código ${error.digest})` : ""}. Normalmente é o banco demorando a responder.</p>
      <p className="text-xs text-ink-3">Normalmente é o banco demorando a responder. Tente de novo; se persistir, veja a tela Avisos.</p>
      <div><button className="btn btn-primary" onClick={reset}>Tentar de novo</button></div>
    </div>
  );
}
