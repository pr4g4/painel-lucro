import { variacao } from "@/lib/calculo";
import { fmtMoeda, fmtNum, fmtPct, fmtPctSimples, fmtRazao, pctFazSentido, type Moeda } from "@/lib/formato";

export function Cartao(props: {
  rotulo: string; valor: number | null | undefined; anterior?: number | null; temBase?: boolean; formato?: "moeda" | "razao" | "pct" | "int" | "texto";
  moeda?: Moeda; taxaMxn?: number | null; destaque?: boolean; hero?: boolean; nota?: string; inverterSinal?: boolean; texto?: string; indisponivel?: string;
}) {
  const { valor, anterior, temBase = true, formato = "moeda", moeda = "BRL", taxaMxn } = props;
  const v = variacao(valor ?? 0, temBase && anterior != null ? anterior : null);
  const bom = v.abs == null ? null : (props.inverterSinal ? v.abs <= 0 : v.abs >= 0);
  const texto = props.indisponivel ? "—" : props.texto ?? (valor == null || !Number.isFinite(valor) ? "—" :
    formato === "moeda" ? fmtMoeda(valor, moeda, taxaMxn) : formato === "razao" ? fmtRazao(valor) : formato === "pct" ? fmtPctSimples(valor) : String(valor));
  const negativo = valor != null && valor < 0 && formato === "moeda" && !props.inverterSinal;
  const positivo = valor != null && valor > 0 && formato === "moeda" && props.destaque && !props.inverterSinal;
  return (
    <div className={`card p-3 md:p-4 flex flex-col gap-1 min-w-0 ${props.hero ? `card-hero ${valor != null && valor < 0 ? "card-hero-neg" : ""}` : props.destaque ? "card-suave" : ""}`}>
      <div className="rotulo truncate" title={props.rotulo}>{props.rotulo}</div>
      <div className={`num ${props.hero ? "valor-xl" : "valor"} ${negativo ? "neg" : positivo ? "pos" : ""}`}>{texto}</div>
      <div className={`text-xs num ${props.hero ? "sub" : "text-ink-3"}`}>
        {props.indisponivel ? <span className="text-warn">dado indisponível: {props.indisponivel}</span> : v.abs == null ? null : (
          <span className={bom ? "pos" : "neg"}>
            {formato === "moeda" ? `${v.abs >= 0 ? "+" : ""}${fmtMoeda(v.abs, moeda, taxaMxn)}` : formato === "pct" ? `${v.abs >= 0 ? "+" : ""}${fmtNum(v.abs * 100, 1)} p.p.` : `${v.abs >= 0 ? "+" : ""}${formato === "int" ? v.abs : fmtNum(v.abs, 2)}`}
            {v.pct != null && formato !== "pct" && pctFazSentido(valor ?? 0, anterior) && ` (${fmtPct(v.pct)})`}
            <span className={props.hero ? "" : "text-ink-3"}> vs. anterior</span>
          </span>
        )}
        {props.nota && <span className="ml-1">· {props.nota}</span>}
      </div>
    </div>
  );
}
