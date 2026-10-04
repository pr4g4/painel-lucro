/**
 * Contrato do webhook da Zenith (página Integrações da conta):
 *   Headers: X-Zenith-Event-Id, X-Zenith-Event-Type, X-Zenith-Timestamp, X-Zenith-Signature
 *   Assinatura: HMAC SHA-256 hex de (timestamp + "." + corpo bruto) com ZENITH_WEBHOOK_SECRET; idade máxima 300 s.
 *   Corpo: { id, type, data: { referenceId, amount (centavos), currency, paymentMethod, status, ... } }
 *
 * Regra de deduplicação de receita (uma venda pode gerar deposit.credited E payment.captured/checkout.succeeded):
 *   a identidade da venda é `data.referenceId` quando existe; senão `data.id`; senão o id do evento.
 *   Todos os eventos da mesma identidade atualizam a MESMA linha de `vendas` (fonte zenith + idOrigem), então a receita
 *   entra uma vez só. O primeiro evento de aprovação fixa `aprovadaEm`; os seguintes não mudam a data nem somam.
 *   Reembolso/chargeback só muda o status e grava `reembolsadaEm` (linha negativa na data do reembolso).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { VendaZenithBruta } from "./zenith";

export const IDADE_MAXIMA_S = 300;

export type CabecalhosZenith = { eventId: string | null; eventType: string | null; timestamp: string | null; signature: string | null };

export function lerCabecalhos(get: (nome: string) => string | null): CabecalhosZenith {
  return { eventId: get("x-zenith-event-id"), eventType: get("x-zenith-event-type"), timestamp: get("x-zenith-timestamp"), signature: get("x-zenith-signature") };
}

export function assinar(timestamp: string, corpoBruto: string, segredo: string): string {
  return createHmac("sha256", segredo).update(`${timestamp}.${corpoBruto}`).digest("hex");
}

/** Devolve null se válido; senão o motivo (sempre responder 401 sem detalhar demais). */
export function verificarAssinatura(h: CabecalhosZenith, corpoBruto: string, segredo: string, agoraMs = Date.now()): string | null {
  if (!h.eventId || !h.timestamp || !h.signature) return "cabeçalho ausente";
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts)) return "timestamp inválido";
  const tsMs = ts > 1e12 ? ts : ts * 1000; // aceita segundos ou milissegundos
  if (Math.abs(agoraMs - tsMs) > IDADE_MAXIMA_S * 1000) return "evento fora da janela de 300 s";
  const esperado = Buffer.from(assinar(h.timestamp, corpoBruto, segredo), "hex");
  const recebido = Buffer.from(h.signature.replace(/^sha256=/i, "").trim(), "hex");
  if (esperado.length === 0 || esperado.length !== recebido.length) return "assinatura inválida";
  if (!timingSafeEqual(esperado, recebido)) return "assinatura inválida";
  return null;
}

export const TIPOS_APROVACAO = ["deposit.credited", "payment.captured", "checkout.succeeded"] as const;
export const TIPOS_TRATADOS = [...TIPOS_APROVACAO, "payment.pending", "payment.refunded", "payment.chargeback"] as const;

export type EventoZenith = { id?: string; type?: string; data?: Record<string, unknown> };
export type Interpretacao =
  | { ok: true; venda: VendaZenithBruta; identidade: string; descricao: string }
  | { ok: false; motivo: string; desconhecido: boolean };

const g = (d: Record<string, unknown>, ...ks: string[]) => { for (const k of ks) { const v = d[k]; if (v !== undefined && v !== null && v !== "") return v; } return undefined; };

/** Converte um evento no formato VendaZenithBruta (contrato interno). Campos faltando → `desconhecido: true` (grava e avisa, não quebra). */
export function interpretarEvento(ev: EventoZenith, tipoHeader: string | null, timestampHeader: string | null, eventId: string): Interpretacao {
  const tipo = String(ev.type ?? tipoHeader ?? "");
  if (!(TIPOS_TRATADOS as readonly string[]).includes(tipo)) return { ok: false, motivo: `tipo não tratado: ${tipo || "(vazio)"}`, desconhecido: !tipo };
  const d = (ev.data ?? {}) as Record<string, unknown>;
  const identidade = String(g(d, "referenceId", "reference_id", "reference") ?? g(d, "id", "paymentId", "depositId") ?? eventId);
  const amountRaw = g(d, "amount", "amountCents", "value");
  const amount = typeof amountRaw === "number" ? amountRaw : typeof amountRaw === "string" ? Number(amountRaw) : NaN;
  const ehReembolso = tipo === "payment.refunded" || tipo === "payment.chargeback";
  if (!Number.isFinite(amount) && !ehReembolso) return { ok: false, motivo: "campo amount ausente ou inválido", desconhecido: true };
  const moeda = String(g(d, "currency") ?? "MXN").toUpperCase() === "BRL" ? "BRL" : "MXN";
  const quando = tsParaDate(g(d, "createdAt", "created_at", "capturedAt", "creditedAt", "paidAt", "occurredAt") as string | number | undefined)
    ?? tsParaDate(timestampHeader ?? undefined) ?? new Date();
  const bruto = Number.isFinite(amount) ? amount / 100 : 0; // centavos → unidades
  const produto = (g(d, "productName", "product", "description", "concept") as string | undefined) ?? null;
  const metodo = String(g(d, "paymentMethod", "method") ?? (tipo === "deposit.credited" ? "spei" : ""));
  const base = { id: identidade, moeda: moeda as "MXN" | "BRL", bruto, produto, payload: { eventoId: eventId, tipo, metodo, data: d } };
  if ((TIPOS_APROVACAO as readonly string[]).includes(tipo)) {
    return { ok: true, identidade, descricao: `${tipo}${metodo ? ` (${metodo})` : ""}`, venda: { ...base, status: "aprovada", criadaEm: quando, aprovadaEm: quando } };
  }
  if (tipo === "payment.pending") return { ok: true, identidade, descricao: tipo, venda: { ...base, status: "pendente", criadaEm: quando, aprovadaEm: null } };
  const quandoReembolso = tsParaDate(g(d, "refundedAt", "refunded_at", "chargebackAt", "occurredAt") as string | number | undefined) ?? quando;
  return { ok: true, identidade, descricao: tipo, venda: { ...base, status: tipo === "payment.chargeback" ? "chargeback" : "reembolsada", criadaEm: null, aprovadaEm: null, reembolsadaEm: quandoReembolso } };
}

function tsParaDate(x: string | number | undefined): Date | null {
  if (x === undefined || x === null || x === "") return null;
  if (typeof x === "number" || /^\d+$/.test(String(x))) { const n = Number(x); return new Date(n > 1e12 ? n : n * 1000); }
  const d = new Date(String(x));
  return Number.isNaN(d.getTime()) ? null : d;
}
