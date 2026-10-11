import { contextoPeriodo } from "@/lib/contexto";
import { dreFatiada } from "@/lib/fatias";
import { Suspense } from "react";
import { SeletorPeriodo } from "@/components/seletor-periodo";
import { TabelaDRE } from "./tabela";
import type { Params } from "@/lib/periodo-url";
import { fmtMoeda } from "@/lib/formato";
import { fontesAtrasadas } from "@/lib/hoje";
import { FaixaAtraso } from "@/components/faixa-atraso";
import { avisosAbertos } from "@/lib/dados";

export const dynamic = "force-dynamic";

export default async function PaginaDRE({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoPeriodo(sp);
  const { estado, atual, anterior, temBaseAnterior, taxaMxn } = ctx;
  const fatias = dreFatiada(ctx.entrada, estado.periodo, estado.gran, estado.tz);
  const avisosAb = await avisosAbertos().catch(() => []);
  const atrasos = fontesAtrasadas(ctx.coletas, estado.agora, avisosAb.some((a) => a.tipo === "webhook_rejeitado"));
  const periodoTocaHoje = estado.periodo.fim.getTime() > estado.agora.getTime() - 60 * 60_000;
  const incompleto = periodoTocaHoje && atrasos.some((a) => a.fonte === "meta" || a.fonte === "tiktok" || a.fonte === "zenith");
  return (
    <>
      <Suspense fallback={<div className="card p-3 h-24 animate-pulse" />}><SeletorPeriodo {...ctx.propsSeletor} /></Suspense>
      {ctx.problemas.length > 0 && <div className="card p-2 text-xs text-warn border-warn">{ctx.problemas.map((p, i) => <div key={i}>⚠ {p}</div>)}</div>}
      {periodoTocaHoje && <FaixaAtraso atrasos={atrasos} tz={estado.tz} />}
      <h1 className="font-semibold">DRE do período <span className="text-xs text-ink-3 font-normal">lucro líquido {fmtMoeda(atual.totais.lucroLiquido, estado.moeda, taxaMxn)} · igual ao cartão do painel</span>{incompleto && <span className="bh-incompleto">incompleto</span>}</h1>
      <TabelaDRE
        atual={{ chave: "atual", rotulo: "Total do período", linhas: atual.linhas, receitaLiquida: atual.totais.receitaLiquida }}
        anterior={{ chave: "anterior", rotulo: "Período anterior", linhas: anterior.linhas, receitaLiquida: anterior.totais.receitaLiquida }}
        temBase={temBaseAnterior}
        intervalos={fatias.map((f) => ({ chave: f.fatia.inicio.toISOString(), rotulo: f.rotulo, linhas: f.dre.linhas, receitaLiquida: f.dre.totais.receitaLiquida }))}
        moeda={estado.moeda} taxaMxn={taxaMxn} rotuloIntervalo={estado.gran === "hora" ? "por hora" : "por dia"}
      />
      <p className="text-xs text-ink-3">Linhas em itálico são informativas (fora da soma). Reembolsos entram na data do reembolso. Imposto sobre lucro usa a base vigente no fim do período.</p>
    </>
  );
}
