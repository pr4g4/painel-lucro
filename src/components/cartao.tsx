import { variacao } from "@/lib/calculo";
import { fmtMoeda, fmtPct, type Moeda } from "@/lib/formato";

export function Cartao(props: {
  rotulo: string; valor: number | null | undefined; anterior?: number | null; temBase?: boolean; formato?: "moeda" | "razao" | "pct" | "int" | "texto";
  moeda?: Moeda; taxaMxn?: number | null; destaque?: boolean; nota?: string; inverterSinal?: boolean; texto?: string;
}) {
  const { valor, anterior, temBase = true, formato = "moeda", moeda = "BRL", taxaMxn } = props;
  const v = variacao(valor ?? 0, temBase && anterior != null ? anterior : null);
  const bom = v.abs == null ? null : (props.inverterSinal ? v.abs <= 0 : v.abs >= 0);
  const texto = props.texto ?? (valor == null || !Number.isFinite(valor) ? "—" :
    formato === "moeda" ? fmtMoeda(valor, moeda, taxaMxn) : formato === "razao" ? `${valor.toFixed(2)}×` : formato === "pct" ? `${(valor * 100).toFixed(1)}%` : formato === "int" ? String(valor) : String(valor));
  return (
    <div className={`card p-3 flex flex-col gap-1 min-w-0 ${props.destaque ? "border-accent" : ""}`}>
      <div className="text-xs text-ink-2 truncate" title={props.rotulo}>{props.rotulo}</div>
      <div className={`num font-semibold ${props.destaque ? "text-2xl" : "text-lg"} ${valor != null && valor < 0 && formato === "moeda" ? "text-neg" : ""}`}>{texto}</div>
      <div className="text-xs text-ink-3 num">
        {v.abs == null ? "sem base de comparação" : (
          <span className={bom ? "text-pos" : "text-neg"}>
            {formato === "moeda" ? `${v.abs >= 0 ? "+" : ""}${fmtMoeda(v.abs, moeda, taxaMxn)}` : formato === "pct" ? `${v.abs >= 0 ? "+" : ""}${(v.abs * 100).toFixed(1)} p.p.` : `${v.abs >= 0 ? "+" : ""}${formato === "int" ? v.abs : v.abs.toFixed(2)}`}
            {v.pct != null && ` (${fmtPct(v.pct)})`}
          </span>
        )}
        {props.nota && <span className="ml-1">· {props.nota}</span>}
      </div>
    </div>
  );
}
