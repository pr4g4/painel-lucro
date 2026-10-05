import { variacao } from "@/lib/calculo";
import { fmtMoeda, fmtPct, pctFazSentido, type Moeda } from "@/lib/formato";

export type FormatoMetrica = "moeda" | "razao" | "pct" | "int" | "texto";

export function textoMetrica(valor: number | null | undefined, formato: FormatoMetrica, moeda: Moeda, taxaMxn?: number | null, texto?: string): string {
  if (texto != null) return texto;
  if (valor == null || !Number.isFinite(valor)) return "—";
  switch (formato) {
    case "moeda": return fmtMoeda(valor, moeda, taxaMxn);
    case "razao": return `${valor.toFixed(2)}×`;
    case "pct": return `${(valor * 100).toFixed(1)}%`;
    default: return String(valor);
  }
}

export function textoVariacao(valor: number | null | undefined, anterior: number | null | undefined, temBase: boolean, formato: FormatoMetrica, moeda: Moeda, taxaMxn?: number | null): { texto: string; bom: boolean | null } {
  const v = variacao(valor ?? 0, temBase && anterior != null ? anterior : null);
  if (v.abs == null) return { texto: "", bom: null };
  const sinal = v.abs >= 0 ? "+" : "";
  const abs = formato === "moeda" ? fmtMoeda(v.abs, moeda, taxaMxn) : formato === "pct" ? `${(v.abs * 100).toFixed(1)} p.p.` : formato === "int" ? String(v.abs) : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v.abs);
  const comPct = v.pct != null && formato !== "pct" && pctFazSentido(valor ?? 0, anterior);
  return { texto: `${sinal}${abs}${comPct ? ` (${fmtPct(v.pct)})` : ""} vs. anterior`, bom: v.abs === 0 ? null : v.abs >= 0 };
}

/** Número sem caixa: rótulo pequeno, valor médio, variação embaixo. Cor só no número e na variação. */
export function Metrica(props: {
  rotulo: string; valor: number | null | undefined; anterior?: number | null; temBase?: boolean; formato?: FormatoMetrica;
  moeda?: Moeda; taxaMxn?: number | null; inverterSinal?: boolean; texto?: string; nota?: string; indisponivel?: string; colorir?: boolean;
}) {
  const { valor, anterior, temBase = true, formato = "moeda", moeda = "BRL", taxaMxn } = props;
  const txt = props.indisponivel ? "—" : textoMetrica(valor, formato, moeda, taxaMxn, props.texto);
  const vr = textoVariacao(valor, anterior, temBase, formato, moeda, taxaMxn);
  const bom = vr.bom == null ? null : props.inverterSinal ? !vr.bom : vr.bom;
  const cor = props.colorir && valor != null && formato === "moeda" && !props.inverterSinal ? (valor < 0 ? "neg" : valor > 0 ? "pos" : "") : "";
  return (
    <div className="metrica" title={props.rotulo}>
      <div className="metrica-k">{props.rotulo}</div>
      <div className={`metrica-v num ${cor}`}>{txt}</div>
      <div className="metrica-s num">
        {props.indisponivel ? <span className="text-warn">dado indisponível: {props.indisponivel}</span>
          : (anterior === undefined || valor == null) && !props.nota ? null
          : anterior === undefined || valor == null || !vr.texto ? props.nota
          : <><span className={bom == null ? "" : bom ? "pos" : "neg"}>{vr.texto}</span>{props.nota && <span> · {props.nota}</span>}</>}
      </div>
    </div>
  );
}
