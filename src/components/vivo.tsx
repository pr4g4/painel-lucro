"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Estado = { vendas: number; lucro: number; ultimaMxn: number | null; dia: string };
const reduzido = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Mantém a inicial viva: a cada 45 s (só com a aba visível) consulta /api/vivo. Venda nova → toast "+1 venda · MX$ 149"
 * e brilho verde no lucro; lucro do dia virando de negativo para positivo → confete curto (1× por dia). Depois, refresh da página.
 */
export function Vivo({ inicial }: { inicial: Estado }) {
  const router = useRouter();
  const ultimo = useRef<Estado>(inicial);
  const [toast, setToast] = useState<string | null>(null);
  const [confete, setConfete] = useState(false);
  useEffect(() => { ultimo.current = inicial; }, [inicial]);
  useEffect(() => {
    let parado = false;
    const checar = async () => {
      if (parado || document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/vivo", { cache: "no-store" }); if (!r.ok) return;
        const novo = (await r.json()) as Estado;
        const ant = ultimo.current;
        if (novo.dia === ant.dia && novo.vendas > ant.vendas) {
          setToast(`+${novo.vendas - ant.vendas} venda${novo.vendas - ant.vendas > 1 ? "s" : ""}${novo.ultimaMxn != null ? ` · MX$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(novo.ultimaMxn)}` : ""}`);
          document.querySelector(".hero-v")?.classList.add("brilho-verde"); setTimeout(() => document.querySelector(".hero-v")?.classList.remove("brilho-verde"), 1400);
          setTimeout(() => setToast(null), 4000);
        }
        if (novo.dia === ant.dia && ant.lucro <= 0 && novo.lucro > 0 && !reduzido()) {
          try { const k = `confete:${novo.dia}`; if (!localStorage.getItem(k)) { localStorage.setItem(k, "1"); setConfete(true); setTimeout(() => setConfete(false), 2600); } } catch { /* sem storage */ }
        }
        if (novo.vendas !== ant.vendas || Math.abs(novo.lucro - ant.lucro) > 0.005) { ultimo.current = novo; router.refresh(); }
      } catch { /* silencioso */ }
    };
    const t = setInterval(checar, 45_000);
    const vis = () => { if (document.visibilityState === "visible") checar(); };
    document.addEventListener("visibilitychange", vis);
    return () => { parado = true; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [router]);
  return (
    <>
      {toast && <div className="toast" role="status">{toast}</div>}
      {confete && <div className="confete" aria-hidden>{Array.from({ length: 28 }).map((_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 90}ms`, background: ["var(--pos)", "var(--accent)", "var(--warn)", "var(--s5)"][i % 4] }} />)}</div>}
    </>
  );
}
