import { textoDesde, type FonteAtrasada } from "@/lib/hoje";

/** Faixa vermelha: fonte sem atualizar além do limite → o lucro de hoje está incompleto. */
export function FaixaAtraso({ atrasos, tz, compacta = false, agora = new Date() }: { atrasos: FonteAtrasada[]; tz: string; compacta?: boolean; agora?: Date }) {
  if (!atrasos.length) return null;
  const partes = atrasos.map((a) => `${a.rotulo} sem atualizar desde ${textoDesde(a.desde, agora, tz)}`);
  return (
    <div className={`faixa-atraso ${compacta ? "faixa-atraso-compacta" : ""}`} role="alert">
      <span>⚠ {partes.join(" · ")} — lucro de hoje está incompleto.</span>
      <a href="/avisos" className="underline ml-2">ver Avisos</a>
    </div>
  );
}
