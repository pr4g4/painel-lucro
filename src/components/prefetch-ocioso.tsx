"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ROTAS = ["/", "/avisos", "/importar", "/parametros"];

/** Quando o navegador estiver ocioso, pré-carrega a casca das outras telas (o Next busca só o esqueleto das rotas dinâmicas). */
export function PrefetchOcioso() {
  const router = useRouter();
  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const id = idle(() => { for (const r of ROTAS) { try { router.prefetch(r); } catch { /* ignora */ } } }, { timeout: 4000 });
    return () => { const cancel = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback; if (cancel) cancel(id); else clearTimeout(id); };
  }, [router]);
  return null;
}
