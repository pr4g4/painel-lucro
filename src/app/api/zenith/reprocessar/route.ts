import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { SESSAO_OPCOES, type Sessao } from "@/lib/auth/sessao";
import { reprocessarEventosZenith, resumoCambio } from "@/coletores/zenith-aplicar";
import { coletarCambio } from "@/coletores/cambio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/zenith/reprocessar[?cambio=1] — reprocessa eventos da Zenith com erro e mostra quantas taxas PTAX existem. Sessão "edita" ou CRON_SECRET. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const segredoOk = !!process.env.CRON_SECRET && (auth === `Bearer ${process.env.CRON_SECRET}` || req.nextUrl.searchParams.get("segredo") === process.env.CRON_SECRET);
  const s = await getIronSession<Sessao>(req, NextResponse.next(), SESSAO_OPCOES);
  if (!segredoOk && s.papel !== "edita") return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const cambio = req.nextUrl.searchParams.get("cambio") === "1" ? await coletarCambio() : null;
  const r = await reprocessarEventosZenith();
  return NextResponse.json({ cambioColetado: cambio, taxas: await resumoCambio(), reprocessamento: r });
}
