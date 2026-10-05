import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { SESSAO_OPCOES, type Sessao } from "@/lib/auth/sessao";
import { provedorAtual } from "@/alertas/provedores";
export const dynamic = "force-dynamic";
/** GET /api/alertas/teste — manda uma mensagem de teste pelo provedor configurado (só logado). */
export async function GET(req: NextRequest) {
  const s = await getIronSession<Sessao>(req, NextResponse.next(), SESSAO_OPCOES);
  if (!s.usuarioId) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const p = provedorAtual();
  if (!p.configurado()) return NextResponse.json({ ok: false, provedor: p.nome, erro: `alerta WhatsApp não configurado: falta ${p.faltando().join(", ")}` }, { status: 503 });
  try { await p.enviar(`✅ Painel de Lucro: teste de alerta enviado por ${s.nome ?? s.usuario} às ${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`); return NextResponse.json({ ok: true, provedor: p.nome }); }
  catch (e) { return NextResponse.json({ ok: false, provedor: p.nome, erro: e instanceof Error ? e.message : String(e) }, { status: 502 }); }
}
