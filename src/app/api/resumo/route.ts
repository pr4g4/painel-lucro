import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { SESSAO_OPCOES, type Sessao } from "@/lib/auth/sessao";
import { resumoDaInicial, lerResumoPronto, propsSeletorDe } from "@/lib/resumos";
import { fmtBRL } from "@/lib/formato";
import { coletarTudo } from "@/coletores";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Atualizar painel" em 1 linha: GET /api/resumo?p=marco_zero (ou qualquer período da URL) → texto
 * "Lucro líquido hoje: R$ X · período (rótulo): R$ Y". Com ?coletar=1 roda a coleta antes.
 * Aceita sessão logada ou CRON_SECRET (para WhatsApp/automação na fase 1.5).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const segredoOk = !!process.env.CRON_SECRET && (auth === `Bearer ${process.env.CRON_SECRET}` || req.nextUrl.searchParams.get("segredo") === process.env.CRON_SECRET);
  const s = await getIronSession<Sessao>(req, NextResponse.next(), SESSAO_OPCOES);
  if (!segredoOk && !s.usuarioId) return new NextResponse("não autorizado", { status: 401 });
  if (req.nextUrl.searchParams.get("coletar") === "1") await coletarTudo();
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { r, estado } = await resumoDaInicial(sp);
  const hoje = (await lerResumoPronto("hoje").catch(() => null))?.totais ?? r.hoje;
  const linha = `Lucro líquido hoje: ${fmtBRL(hoje.lucroLiquido)} · ${propsSeletorDe(estado, false).rotuloPeriodo}: ${fmtBRL(r.totais.lucroLiquido)} (${r.totais.numVendas} vendas, meta c/ imposto ${fmtBRL(r.totais.metaComImposto)}, IA ${fmtBRL(r.totais.ia)})`;
  return new NextResponse(linha, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
