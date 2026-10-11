"use client";
import { useEffect, useRef, useState } from "react";

const g = globalThis as unknown as { __numerosAnteriores?: Map<string, number> };
const anteriores = () => (g.__numerosAnteriores ??= new Map<string, number>());
const reduzido = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Mostra `texto` (formatado no servidor). Ao mudar de valor, conta do anterior até o novo em ~400 ms
 * com algarismos tabulares; com prefers-reduced-motion troca direto. O anterior fica em memória por `chave`.
 */
export function NumeroAnimado({ chave, valor, texto, casas = 2, prefixo = "", className = "" }: { chave: string; valor: number; texto: string; casas?: number; prefixo?: string; className?: string }) {
  const [mostrado, setMostrado] = useState(texto);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const ant = anteriores().get(chave);
    anteriores().set(chave, valor);
    if (ant === undefined || ant === valor || reduzido() || !Number.isFinite(ant)) { setMostrado(texto); return; }
    const t0 = performance.now(); const dur = 400;
    const fmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 3);
      const v = ant + (valor - ant) * e;
      setMostrado(p >= 1 ? texto : `${v < 0 ? "-" : ""}${prefixo}${fmt.format(Math.abs(v))}`);
      if (p < 1) raf.current = requestAnimationFrame(passo);
    };
    raf.current = requestAnimationFrame(passo);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [chave, valor, texto, casas, prefixo]);
  return <span className={`num ${className}`}>{mostrado}</span>;
}
