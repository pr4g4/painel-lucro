import Link from "next/link";
import { dadosHoje, semaforoSaldo, coletaFalhando, avaliarAgendadorSeParado, type Semaforo } from "@/lib/hoje";
import { fmtBRL } from "@/lib/formato";

const COR: Record<Semaforo, string> = { verde: "var(--pos)", amarelo: "var(--warn)", vermelho: "var(--neg)", cinza: "var(--text-3)" };

/** Barra fixa "Hoje" no topo de todas as páginas (desktop e celular). Cada item leva ao detalhe. */
export async function BarraHoje() {
  const d = await dadosHoje();
  void avaliarAgendadorSeParado(d);
  const t = d.hoje?.totais;
  const sk = semaforoSaldo(d.kie, coletaFalhando(d.coletas.get("kie"), d.agora));
  const so = semaforoSaldo(d.openai, coletaFalhando(d.coletas.get("openai"), d.agora));
  const horas = (h: number | null | undefined) => (h == null ? "" : h >= 48 ? ` · ~${(h / 24).toFixed(0)} d` : ` · ~${h.toFixed(1)} h`);
  const usd = (v: number | null | undefined) => (v == null ? "—" : `US$ ${v.toFixed(2)}`);
  return (
    <div className="barra-hoje" role="region" aria-label="Hoje">
      <div className="barra-hoje-inner">
        <span className="bh-rotulo">Hoje</span>
        <Link href="/?p=hoje" prefetch={false} className="bh-item">
          <span className="bh-k">Lucro líquido</span>
          <span className={`bh-v num ${t ? (t.lucroLiquido >= 0 ? "pos" : "neg") : ""}`}>{t ? fmtBRL(t.lucroLiquido) : "—"}</span>
        </Link>
        <Link href="/dre?p=hoje" prefetch={false} className="bh-item"><span className="bh-k">Receita líq.</span><span className="bh-v num">{t ? fmtBRL(t.receitaLiquida) : "—"}</span></Link>
        <Link href="/campanhas?p=hoje" prefetch={false} className="bh-item"><span className="bh-k">Meta c/ imp.</span><span className="bh-v num">{t ? fmtBRL(t.metaComImposto) : "—"}</span></Link>
        <Link href="/custos?p=hoje" prefetch={false} className="bh-item"><span className="bh-k">IA</span><span className="bh-v num">{t ? fmtBRL(t.ia) : "—"}</span></Link>
        <Link href="/#creditos" prefetch={false} className="bh-item" title={d.kie?.indisponivel ?? ""}>
          <span className="bh-k"><i className="bh-luz" style={{ background: COR[sk] }} />kie.ai</span>
          <span className="bh-v num">{d.kie?.saldoUsd != null ? usd(d.kie.saldoUsd) + horas(d.kie.horasRestantes) : "—"}</span>
        </Link>
        <Link href="/#creditos" prefetch={false} className="bh-item" title={d.openai?.indisponivel ?? "estimado"}>
          <span className="bh-k"><i className="bh-luz" style={{ background: COR[so] }} />OpenAI<span className="text-ink-3"> est.</span></span>
          <span className="bh-v num">{d.openai?.saldoUsd != null ? usd(d.openai.saldoUsd) + horas(d.openai.horasRestantes) : "—"}</span>
        </Link>
      </div>
    </div>
  );
}
