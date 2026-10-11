"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Ponto pulsando + "atualizado há X min" + botão de atualizar (ícone gira enquanto coleta). */
export function StatusLinha({ ultimaOkIso, agendadorOk }: { ultimaOkIso: string | null; agendadorOk: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "rodando" | "ok" | "erro">("idle");
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  const min = ultimaOkIso ? Math.max(0, Math.round((Date.now() - new Date(ultimaOkIso).getTime()) / 60_000)) : null;
  const texto = min == null ? "sem atualização ainda" : min < 1 ? "atualizado agora" : min < 60 ? `atualizado há ${min} min` : `atualizado há ${Math.round(min / 60)} h`;
  async function atualizar() {
    if (estado === "rodando") return;
    setEstado("rodando");
    try { const r = await fetch("/api/coleta/todas", { method: "POST" }); setEstado(r.ok ? "ok" : "erro"); router.refresh(); } catch { setEstado("erro"); }
    setTimeout(() => setEstado("idle"), 2500);
  }
  const cor = estado === "erro" ? "var(--neg)" : agendadorOk && (min ?? 999) <= 15 ? "var(--pos)" : "var(--warn)";
  return (
    <div className="status-linha">
      <span className="pulso" style={{ background: cor }} aria-hidden />
      <span className="text-ink-3 num">{estado === "rodando" ? "atualizando…" : estado === "ok" ? "atualizado ✓" : estado === "erro" ? "falhou (veja Avisos)" : texto}</span>
      <button type="button" className="btn-icone" onClick={atualizar} disabled={estado === "rodando"} aria-label="Atualizar agora" title="Atualizar agora">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={estado === "rodando" ? "gira" : ""}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
      </button>
    </div>
  );
}
