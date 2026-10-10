import type { FonteAtrasada } from "@/lib/hoje";
import { fmtHora } from "@/lib/formato";

/** Faixa vermelha: fonte sem atualizar além do limite → o lucro de hoje está incompleto. */
export function FaixaAtraso({ atrasos, tz, compacta = false }: { atrasos: FonteAtrasada[]; tz: string; compacta?: boolean }) {
  if (!atrasos.length) return null;
  const partes = atrasos.map((a) => `${a.rotulo} sem atualizar desde ${a.desde ? fmtHora(a.desde, tz) : "o início"}`);
  return (
    <div className={`faixa-atraso ${compacta ? "faixa-atraso-compacta" : ""}`} role="alert">
      <span>⚠ {partes.join(" · ")} — lucro de hoje está incompleto.</span>
      <a href="/avisos" className="underline ml-2">ver Avisos</a>
    </div>
  );
}
