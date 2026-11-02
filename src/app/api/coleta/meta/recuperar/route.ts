import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { SESSAO_OPCOES, type Sessao } from "@/lib/auth/sessao";
import { recuperarMeta, metaClienteReal } from "@/coletores/meta";
import { invalidarDados } from "@/lib/cache";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/coleta/meta/recuperar?de=2026-10-14&ate=2026-11-01 — rebusca a Meta dia a dia (por hora), idempotente.
 * Autoriza por CRON_SECRET ou sessão de editor. Processa o que couber em ~45 s e devolve `continuar` com a URL do resto.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const segredoOk = !!process.env.CRON_SECRET && (auth === `Bearer ${process.env.CRON_SECRET}` || req.nextUrl.searchParams.get("segredo") === process.env.CRON_SECRET);
  const s = await getIronSession<Sessao>(req, NextResponse.next(), SESSAO_OPCOES);
  if (!segredoOk && s.papel !== "edita") return NextResponse.json({ erro: "não autorizado (sessão de editor ou CRON_SECRET)" }, { status: 401 });
  const de = req.nextUrl.searchParams.get("de") ?? "", ate = req.nextUrl.searchParams.get("ate") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || de > ate) return NextResponse.json({ erro: "use ?de=AAAA-MM-DD&ate=AAAA-MM-DD (de ≤ ate)" }, { status: 400 });
  const token = process.env.META_TOKEN;
  const contas = [process.env.META_ACT_00, process.env.META_ACT_01].filter(Boolean) as string[];
  if (!token || !contas.length) return NextResponse.json({ erro: "Meta não configurada (META_TOKEN / META_ACT_00 / META_ACT_01)" }, { status: 400 });
  const esquema = await (await import("@/db/esquema")).verificarEsquema(true).catch((e) => ({ ok: false, aplicados: [], pendentes: [], erro: String(e) }));
  const r = await recuperarMeta(metaClienteReal(token), contas, de, ate);
  invalidarDados();
  const gravados = r.dias.reduce((s, d) => s + d.gravados, 0), erros = r.dias.filter((d) => d.erro);
  const continuar = r.proximo ? `${req.nextUrl.origin}/api/coleta/meta/recuperar?de=${r.proximo}&ate=${ate}` : null;
  return NextResponse.json({
    resumo: `${r.dias.length} dia×conta processados, ${gravados} lançamento(s) gravados/atualizados, ${erros.length} erro(s), ${r.chamadas} chamada(s) à Meta em ${Math.round(r.duracaoMs / 1000)} s.${continuar ? " NÃO TERMINOU: abra a URL em `continuar`." : " Concluído."}`,
    continuar, esquema, dias: r.dias,
  });
}
