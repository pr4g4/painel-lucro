import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth/sessao";
import { contextoPeriodo } from "@/lib/contexto";
import { diaBrasilia } from "@/coletores/base";

export const dynamic = "force-dynamic";

/** Estado de hoje para a página inicial "viva": nº de vendas, lucro líquido e o bruto da última venda (MX$). */
export async function GET() {
  const s = await getSessao();
  if (!s.usuarioId) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const ctx = await contextoPeriodo({ p: "hoje" });
  const hojeP = ctx.estado.periodo;
  const vendas = ctx.entrada.vendas.filter((v) => v.status === "aprovada" && v.aprovadaEm && v.aprovadaEm >= hojeP.inicio && v.aprovadaEm < hojeP.fim && !v.historico).sort((a, b) => a.aprovadaEm!.getTime() - b.aprovadaEm!.getTime());
  const ultima = vendas.at(-1);
  return NextResponse.json({ vendas: ctx.atual.totais.numVendas, lucro: ctx.atual.totais.lucroLiquido, ultimaMxn: ultima && ultima.moeda === "MXN" ? ultima.brutoOriginal : null, dia: diaBrasilia(ctx.estado.agora) }, { headers: { "cache-control": "no-store" } });
}
