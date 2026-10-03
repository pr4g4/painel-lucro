import { NextResponse, type NextRequest } from "next/server";
import { importarVendasZenith, type VendaZenithBruta } from "@/coletores/zenith";

export const dynamic = "force-dynamic";

/**
 * Receptor de webhook da Zenith (formato a confirmar quando o Erick abrir Integrações).
 * Protegido por ZENITH_WEBHOOK_SECRET (cabeçalho x-webhook-secret ou ?segredo=). Aceita um objeto ou uma lista no formato VendaZenithBruta.
 * Até conhecer o payload real, `adaptar()` tenta os nomes de campo mais comuns.
 */
export async function POST(req: NextRequest) {
  const segredo = process.env.ZENITH_WEBHOOK_SECRET;
  if (!segredo) return NextResponse.json({ erro: "ZENITH_WEBHOOK_SECRET não configurado" }, { status: 503 });
  const dado = req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("segredo");
  if (dado !== segredo) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  const lista = (Array.isArray(body) ? body : [body]).map(adaptar).filter(Boolean) as VendaZenithBruta[];
  const r = await importarVendasZenith(lista, "zenith");
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}

function adaptar(x: Record<string, unknown>): VendaZenithBruta | null {
  const g = (...ks: string[]) => { for (const k of ks) if (x[k] != null) return x[k]; return undefined; };
  const id = g("id", "transaction_id", "sale_id", "codigo");
  if (id == null) return null;
  const statusRaw = String(g("status", "payment_status") ?? "").toLowerCase();
  const status: VendaZenithBruta["status"] = /aprov|paid|approved|complet/.test(statusRaw) ? "aprovada" : /reemb|refund/.test(statusRaw) ? "reembolsada" : /charge/.test(statusRaw) ? "chargeback" : /cancel/.test(statusRaw) ? "cancelada" : "pendente";
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: String(id), status,
    criadaEm: g("created_at", "criado_em", "data") as string | undefined,
    aprovadaEm: g("approved_at", "paid_at", "aprovado_em", "data_aprovacao") as string | undefined,
    reembolsadaEm: g("refunded_at", "reembolsado_em") as string | undefined,
    moeda: String(g("currency", "moeda") ?? "MXN").toUpperCase() === "BRL" ? "BRL" : "MXN",
    bruto: n(g("amount", "valor", "bruto", "total")) ?? 0,
    brlEstimado: n(g("amount_brl", "brl_estimado", "valor_brl")),
    liquido: n(g("net_amount", "liquido", "valor_liquido")),
    reserva: n(g("reserve", "reserva", "reserve_amount")),
    produto: (g("product_name", "produto", "product") as string | undefined) ?? null,
    payload: x,
  };
}
