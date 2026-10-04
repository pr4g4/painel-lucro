import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema, executar } from "@/db";
import { lerCabecalhos, verificarAssinatura, interpretarEvento, type EventoZenith } from "@/coletores/zenith-webhook";
import { normalizarVenda, acharVendaZenith } from "@/coletores/zenith";
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

  // 2) interpreta e aplica
  let resultado = "";
  let vendaIdOrigem: string | null = null;
  try {
    const r = interpretarEvento(ev, h.eventType, h.timestamp, eventoId);
    if (!r.ok) {
      resultado = `ignorado: ${r.motivo}`;
      if (r.desconhecido) await abrirAviso("formato_desconhecido", "zenith", `Webhook da Zenith com formato desconhecido (evento ${eventoId}): ${r.motivo}. Payload guardado em zenith_eventos.`);
    } else {
      vendaIdOrigem = r.identidade;
      const nova = await normalizarVenda(r.venda, "zenith");
      const existente = await acharVendaZenith([r.identidade, ...(r.venda.ids ?? [])]);
      if (!existente) {
        if (nova.status === "reembolsada" || nova.status === "chargeback") {
          // reembolso de venda que nunca entrou (anterior ao acompanhamento): guarda como histórico e avisa, sem subtrair receita
          nova.historico = true;
          await abrirAviso("reembolso_sem_venda", "zenith", `Reembolso/chargeback de venda desconhecida (${r.identidade}); guardado como histórico, fora dos totais.`);
        }
        await executar((d) => d.insert(schema.vendas).values(nova));
        resultado = `venda ${r.identidade} criada: ${nova.status} (${r.descricao})`;
      } else if (nova.status === "aprovada") {
        if (existente.status === "pendente") {
          // pendente → aprovada: entra na receita na hora da aprovação
          await executar((d) => d.update(schema.vendas).set({ status: "aprovada", aprovadaEm: nova.aprovadaEm, brutoOriginal: nova.brutoOriginal, taxaCambio: nova.taxaCambio, brutoBrl: nova.brutoBrl, taxaPctBrl: nova.taxaPctBrl, taxaFixaBrl: nova.taxaFixaBrl, cambioPctBrl: nova.cambioPctBrl, liquidoBrl: nova.liquidoBrl, reservaBrl: nova.reservaBrl, historico: nova.historico, payload: nova.payload, coletadoEm: new Date() }).where(eq(schema.vendas.id, existente.id)));
          resultado = `venda ${r.identidade} aprovada (era pendente) via ${r.descricao}`;
        } else {
          // já aprovada/reembolsada: segundo evento de aprovação da mesma venda → não soma de novo
          resultado = `venda ${r.identidade} já registrada (${existente.status}); ${r.descricao} não somou de novo`;
        }
      } else if (nova.status === "pendente") {
        resultado = `venda ${r.identidade} já ${existente.status}; pending ignorado`;
      } else {
        // reembolso/chargeback de venda conhecida: muda status e data do reembolso (receita original fica; linha negativa na data do reembolso)
        await executar((d) => d.update(schema.vendas).set({ status: nova.status, reembolsadaEm: nova.reembolsadaEm, coletadoEm: new Date() }).where(eq(schema.vendas.id, existente.id)));
        resultado = `venda ${r.identidade} marcada ${nova.status} em ${nova.reembolsadaEm?.toISOString()}`;
      }
    }
  } catch (e) {
    resultado = `erro: ${e instanceof Error ? e.message : String(e)}`;
    await abrirAviso("coleta_falhou", "zenith", `Webhook da Zenith (evento ${eventoId}) falhou ao aplicar: ${resultado}`);
  }
  await executar((d) => d.update(schema.zenithEventos).set({ processado: !resultado.startsWith("erro"), resultado, vendaIdOrigem }).where(eq(schema.zenithEventos.id, linhaId)));
  await executar((d) => d.insert(schema.coletas).values({ fonte: "zenith", terminadaEm: new Date(), ok: !resultado.startsWith("erro"), registros: 1, detalhe: { eventoId, resultado } }));
  return NextResponse.json({ ok: true, resultado });
}

export async function GET() {
  return NextResponse.json({ ok: true, nota: "Webhook da Zenith: use POST com X-Zenith-Event-Id, X-Zenith-Event-Type, X-Zenith-Timestamp e X-Zenith-Signature." });
}

export { db };
