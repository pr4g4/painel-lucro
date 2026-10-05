import { carregarCreditos } from "@/coletores/creditos";
import { alertaSaldo, type SaldoIA } from "@/lib/calculo";
import { fmtHora } from "@/lib/formato";
import { paraInputLocal } from "@/lib/periodo-url";
import { FormCreditoOpenAI } from "./creditos-form";

const usd = (v: number | null | undefined, casas = 2) => (v == null || !Number.isFinite(v) ? "—" : `US$ ${v.toFixed(casas)}`);

export async function CartoesCreditos({ tz, agora, edita }: { tz: string; agora: Date; edita: boolean }) {
  let dados: Awaited<ReturnType<typeof carregarCreditos>> | null = null;
  let erro = "";
  try { dados = await carregarCreditos(agora, tz); } catch (e) { erro = e instanceof Error ? e.message : String(e); }
  if (!dados) return <div className="card p-3 text-xs text-warn">Créditos das IAs: dado indisponível ({erro}).</div>;
  const { kie, openai, limites } = dados;
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-2">
      <Cartao s={kie} titulo="Créditos kie.ai" tz={tz} limites={limites} />
      <Cartao s={openai} titulo="Créditos OpenAI" tz={tz} limites={limites} rodape={edita ? <FormCreditoOpenAI tz={tz} agoraLocal={paraInputLocal(agora, tz)} /> : null} />
    </section>
  );
}

function Cartao({ s, titulo, tz, limites, rodape }: { s: SaldoIA; titulo: string; tz: string; limites: { horas: number; usd: number }; rodape?: React.ReactNode }) {
  const alerta = alertaSaldo(s, limites);
  const horas = s.horasRestantes == null ? "—" : s.horasRestantes >= 48 ? `~${(s.horasRestantes / 24).toFixed(1)} dias` : `~${s.horasRestantes.toFixed(1)} h`;
  return (
    <div className={`card p-3 md:p-4 ${alerta ? "border-neg" : ""}`} style={alerta ? { borderColor: "var(--neg)" } : undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="rotulo">{titulo}{s.estimado && !s.indisponivel && <span className="text-ink-3"> · estimado</span>}</div>
        <div className="text-xs text-ink-3">{s.lidoEm ? `${s.fonte === "kie" ? "lido" : "referência"} ${fmtHora(s.lidoEm, tz)}` : ""}</div>
      </div>
      {s.indisponivel ? <div className="text-sm text-warn mt-1">dado indisponível: {s.indisponivel}</div> : (
        <>
          <div className={`num valor ${alerta ? "neg" : ""}`}>{usd(s.saldoUsd)}{s.saldoCreditos != null && <span className="text-base font-medium text-ink-2"> · {Math.round(s.saldoCreditos)} créditos</span>}</div>
          <div className="text-xs text-ink-2 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 num">
            <span>última 1 h {usd(s.usoUltimaHoraUsd)}</span>
            <span>hoje {usd(s.usoHojeUsd)}</span>
            <span>ritmo {usd(s.ritmoUsdPorHora)}/h</span>
            <span className={alerta ? "neg font-semibold" : ""}>acaba em {horas}</span>
            {s.recargasHojeQtd > 0 && <span>recargas hoje: {s.recargasHojeQtd} ({usd(s.recargasHojeUsd)})</span>}
          </div>
          {s.referencia && <div className="text-xs text-ink-3 mt-1 num">= {usd(s.referencia.valorUsd)} conferido + {usd(s.referencia.recargasDepoisUsd)} recargas − {usd(s.referencia.custoDepoisUsd)} consumo desde a referência</div>}
          {alerta && <div className="text-xs neg font-semibold mt-1">⚠ {alerta}</div>}
        </>
      )}
      {rodape}
    </div>
  );
}
