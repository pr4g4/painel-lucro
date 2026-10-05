import { NextResponse, type NextRequest } from "next/server";
import { invalidarDados } from "@/lib/cache";
import { eq } from "drizzle-orm";
import { db, schema, executar } from "@/db";
import { lerCabecalhos, verificarAssinatura, type EventoZenith } from "@/coletores/zenith-webhook";
import { aplicarEvento } from "@/coletores/zenith-aplicar";
import { abrirAviso } from "@/coletores/base";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/zenith/webhook — ver contrato em src/coletores/zenith-webhook.ts.
 * Ordem: lê o CORPO BRUTO → verifica assinatura (401 se falhar) → grava o evento (idempotente por X-Zenith-Event-Id)
 * → aplica na tabela `vendas` → 200. Reenvio do mesmo evento devolve 200 sem reprocessar.
 */
export async function POST(req: NextRequest) {
  // 0) CORPO BRUTO primeiro (antes de qualquer parse): a assinatura é calculada sobre os bytes exatos recebidos
  const corpoBruto = await req.text();
  const h = lerCabecalhos((n) => req.headers.get(n));
  const segredo = process.env.ZENITH_WEBHOOK_SECRET ?? "";
  const v = verificarAssinatura(h, corpoBruto, segredo);
  if (!v.ok) {
    // grava a rejeição para auditoria (corpo bruto + headers X-Zenith-*; nunca o segredo). Id próprio para não bloquear o reenvio válido.
    const headersZenith: Record<string, string> = {};
    req.headers.forEach((val, k) => { if (k.toLowerCase().startsWith("x-zenith-")) headersZenith[k] = val; });
    const idRejeicao = `${h.eventId ?? "sem-id"}#rejeitado#${Date.now()}`;
    await executar((d) => d.insert(schema.zenithEventos).values({
      eventoId: idRejeicao, tipo: h.eventType ?? "desconhecido", timestampZenith: v.diag.timestampLido != null ? new Date(v.diag.unidadeTimestamp === "ms" ? v.diag.timestampLido : v.diag.timestampLido * 1000) : null,
      assinaturaOk: false, processado: false, resultado: `401: ${v.motivo}`, vendaIdOrigem: null,
      payload: { corpoBruto, headers: headersZenith, diagnostico: v.diag },
    }).onConflictDoNothing()).catch(() => {});
    await abrirAviso("webhook_rejeitado", "zenith", `Webhook da Zenith rejeitado (401): ${v.motivo}. Veja zenith_eventos (evento ${idRejeicao}).`).catch(() => {});
    return NextResponse.json({ erro: "não autorizado", motivo: v.motivo }, { status: 401 });
  }

  let ev: EventoZenith;
  try { ev = JSON.parse(corpoBruto); } catch { ev = {}; }
  const eventoId = h.eventId!;
  const tsZenith = Number(h.timestamp);
  const timestampZenith = Number.isFinite(tsZenith) ? new Date(tsZenith > 1e12 ? tsZenith : tsZenith * 1000) : null;
  const payload = corpoBruto.length > 0 && Object.keys(ev).length ? ev : { corpoBruto };

  // 1) grava o evento bruto; se já existe, é reenvio → 200 sem reprocessar
  const inserido = await executar((d) => d.insert(schema.zenithEventos)
    .values({ eventoId, tipo: String(ev.type ?? h.eventType ?? "desconhecido"), timestampZenith, assinaturaOk: true, payload: { ...payload, _assinatura: v.variante } })
    .onConflictDoNothing().returning({ id: schema.zenithEventos.id }));
  if (inserido.length === 0) return NextResponse.json({ ok: true, duplicado: true });
  const linhaId = inserido[0].id;

  // 2) interpreta e aplica (mesma lógica do reprocessamento)
  let resultado = "";
  let vendaIdOrigem: string | null = null;
  try {
    const r = await aplicarEvento(ev, h.eventType, h.timestamp, eventoId);
    resultado = r.resultado; vendaIdOrigem = r.vendaIdOrigem;
  } catch (e) {
    resultado = `erro: ${e instanceof Error ? e.message : String(e)}`;
    await abrirAviso("coleta_falhou", "zenith", `Webhook da Zenith (evento ${eventoId}) falhou ao aplicar: ${resultado}. Será reprocessado automaticamente na próxima coleta de câmbio.`);
  }
  await executar((d) => d.update(schema.zenithEventos).set({ processado: !resultado.startsWith("erro"), resultado, vendaIdOrigem }).where(eq(schema.zenithEventos.id, linhaId)));
  await executar((d) => d.insert(schema.coletas).values({ fonte: "zenith", terminadaEm: new Date(), ok: !resultado.startsWith("erro"), registros: 1, detalhe: { eventoId, resultado } }));
  invalidarDados();
  return NextResponse.json({ ok: true, resultado });
}

export async function GET() {
  return NextResponse.json({ ok: true, nota: "Webhook da Zenith: use POST com X-Zenith-Event-Id, X-Zenith-Event-Type, X-Zenith-Timestamp e X-Zenith-Signature." });
}

export { db };
