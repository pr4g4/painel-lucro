"use client";
export default function ErroGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR"><body style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Dado indisponível</h1>
      <p>O app não conseguiu carregar. Motivo: {error.message || "erro interno"}.</p>
      <button onClick={reset}>Tentar de novo</button>
    </body></html>
  );
}
