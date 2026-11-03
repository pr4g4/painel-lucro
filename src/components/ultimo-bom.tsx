"use client";
import { useEffect } from "react";

export type UltimoBom = { quando: string; periodo: string; lucro: number; lucroTexto: string; itens: { k: string; v: string }[] };
const CHAVE = "painel:ultimoBom";

/** Guarda no aparelho os números principais da última carga boa, para a tela de erro mostrar algo útil. */
export function GuardarUltimoBom(props: UltimoBom) {
  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(props)); } catch { /* sem storage */ } }, [props]);
  return null;
}

export function lerUltimoBom(): UltimoBom | null {
  try { const s = localStorage.getItem(CHAVE); return s ? (JSON.parse(s) as UltimoBom) : null; } catch { return null; }
}
