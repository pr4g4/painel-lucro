import { NextResponse, type NextRequest } from "next/server";
import { interpretarEvento } from "@/coletores/zenith-webhook";
import { importarVendasZenith, type VendaZenithBruta } from "@/coletores/zenith";
import { getIronSession } from "iron-session";
import { SESSAO_OPCOES, type Sessao } from "@/lib/auth/sessao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Backfill pela API da Zenith (lista de pagamentos/depósitos por data).
 * A documentação (docs.zenithworld.com.br/payments-api) não pôde ser lida pelo ambiente de desenvolvimento, então o endereço
 * e o caminho são configuráveis por variável de ambiente, e o mapeamento dos campos é o mesmo do webhook (tolerante):
 *   ZENITH_API_BASE      ex.: https://api.zenithworld.com.br
 *   ZENITH_API_LIST_PATH ex.: /v1/payments?from={desde}&to={ate}&page={page}   ({desde}/{ate} em ISO, {page} a partir de 1)
 *   ZENITH_API_AUTH      ex.: "bearer-secret" (Authorization: Bearer SECRET) | "basic" (public:secret) | "headers" (X-Public-Key / X-Secret-Key)
 *   ZENITH_PUBLIC_KEY, ZENITH_SECRET_KEY
 * GET /api/zenith/backfill?desde=2026-10-03T03:00:00Z&ate=...&dry=1  (sessão logada ou CRON_SECRET)
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const segredoOk = !!process.env.CRON_SECRET && (auth === `Bearer ${process.env.CRON_SECRET}` || req.nextUrl.searchParams.get("segredo") === process.env.CRON_SECRET);
  const s = await getIronSession<Sessao>(req, NextResponse.next(), SESSAO_OPCOES);
  if (!segredoOk && s.papel !== "edita") return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const base = process.env.ZENITH_API_BASE, path = process.env.ZENITH_API_LIST_PATH, pub = process.env.ZENITH_PUBLIC_KEY, sec = process.env.ZENITH_SECRET_KEY;
  const modo = process.env.ZENITH_API_AUTH ?? "bearer-secret";
  if (!base || !path || !sec) return NextResponse.json({ erro: "configure ZENITH_API_BASE, ZENITH_API_LIST_PATH, ZENITH_SECRET_KEY (e ZENITH_PUBLIC_KEY se a API exigir) na Vercel; veja docs/pendencias.md" }, { status: 503 });
  const desde = req.nextUrl.searchParams.get("desde") ?? "2026-10-03T03:00:00Z";
  const ate = req.nextUrl.searchParams.get("ate") ?? new Date().toISOString();
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (modo === "basic") headers.Authorization = `Basic ${Buffer.from(`${pub ?? ""}:${sec}`).toString("base64")}`;
  else if (modo === "headers") { headers["X-Public-Key"] = pub ?? ""; headers["X-Secret-Key"] = sec; }
  else headers.Authorization = `Bearer ${sec}`;

  const vendas: VendaZenithBruta[] = []; const amostra: unknown[] = []; let paginas = 0;
  for (let page = 1; page <= 50; page++) {
    const url = base.replace(/\/$/, "") + path.replace("{desde}", encodeURIComponent(desde)).replace("{ate}", encodeURIComponent(ate)).replace("{page}", String(page));
    const r = await fetch(url, { headers, cache: "no-store" });
    if (!r.ok) return NextResponse.json({ erro: `Zenith respondeu HTTP ${r.status}`, url: url.replace(/key=[^&]+/g, "key=***"), corpo: (await r.text()).slice(0, 500) }, { status: 502 });
    const j = await r.json();
    const lista: Record<string, unknown>[] = Array.isArray(j) ? j : (j.data ?? j.items ?? j.results ?? j.payments ?? j.deposits ?? []);
    paginas++;
    if (!lista.length) break;
    for (const item of lista) {
      if (amostra.length < 2) amostra.push(item);
      const status = String(item.status ?? "").toLowerCase();
      const tipo = /refund|reemb/.test(status) ? "payment.refunded" : /charge/.test(status) ? "payment.chargeback" : /pend|wait|process/.test(status) ? "payment.pending" : /paid|approved|captured|credited|succe|complet|aprov/.test(status) ? "payment.captured" : "";
      if (!tipo) continue;
      const r2 = interpretarEvento({ id: String(item.id ?? ""), type: tipo, data: item }, null, null, `backfill:${item.id ?? ""}`);
      if (r2.ok) vendas.push(r2.venda);
    }
    if (lista.length < 10 || !path.includes("{page}")) break;
  }
  if (dry) return NextResponse.json({ dry: true, paginas, encontradas: vendas.length, amostra, primeiras: vendas.slice(0, 3) });
  const res = await importarVendasZenith(vendas, "zenith");
  return NextResponse.json({ paginas, encontradas: vendas.length, importadas: res.registros, ok: res.ok, erro: res.erro });
}
