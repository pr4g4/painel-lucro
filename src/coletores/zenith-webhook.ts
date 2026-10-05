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
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { VendaZenithBruta } from "./zenith";

export const IDADE_MAXIMA_S = 300;

export type CabecalhosZenith = { eventId: string | null; eventType: string | null; timestamp: string | null; signature: string | null };

export function lerCabecalhos(get: (nome: string) => string | null): CabecalhosZenith {
  return { eventId: get("x-zenith-event-id"), eventType: get("x-zenith-event-type"), timestamp: get("x-zenith-timestamp"), signature: get("x-zenith-signature") };
}

export function assinar(timestamp: string, corpoBruto: string, segredo: string): string {
  return createHmac("sha256", segredo).update(`${timestamp}.${corpoBruto}`).digest("hex");
}

export type Diagnostico = {
  timestampLido: number | null; unidadeTimestamp: "s" | "ms" | null; idadeS: number | null;
  assinaturasRecebidas: number; formatos: string[]; tamanhoCorpo: number; sha256Corpo: string;
  bateuComCorpoSozinho: boolean; segredoTamanho: number;
};
export type Verificacao = { ok: true; variante: string; diag: Diagnostico } | { ok: false; motivo: string; diag: Diagnostico };

/** Normaliza o header de assinatura: "abc", "sha256=abc", "v1=abc", "t=123,v1=abc,v1=def", hex ou base64 → lista de Buffers. */
export function extrairAssinaturas(header: string): { buf: Buffer; formato: string }[] {
  const out: { buf: Buffer; formato: string }[] = [];
  for (const parte of header.split(",")) {
    let v = parte.trim();
    if (!v) continue;
    const m = v.match(/^(sha256|v1|v0|s|sig|signature)=(.+)$/i);
    if (m) v = m[2].trim(); else if (/^t=/i.test(v)) continue; // "t=timestamp" não é assinatura
    if (/^[0-9a-f]{64}$/i.test(v)) out.push({ buf: Buffer.from(v, "hex"), formato: "hex" });
    else if (/^[A-Za-z0-9+/=_-]{40,}$/.test(v)) {
      const b = Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      if (b.length === 32) out.push({ buf: b, formato: "base64" }); else out.push({ buf: b, formato: `base64(${b.length}B)` });
    } else out.push({ buf: Buffer.from(v), formato: "desconhecido" });
  }
  return out;
}

const igual = (a: Buffer, b: Buffer) => a.length === b.length && a.length > 0 && timingSafeEqual(a, b);

/** Verificação tolerante: timestamp em s ou ms; assinatura hex ou base64, com/sem prefixo, várias separadas por vírgula; segredo com trim. */
export function verificarAssinatura(h: CabecalhosZenith, corpoBruto: string, segredoBruto: string, agoraMs = Date.now()): Verificacao {
  const segredo = (segredoBruto ?? "").trim();
  const ts = h.timestamp != null && h.timestamp.trim() !== "" ? Number(h.timestamp.trim()) : NaN;
  const unidade = Number.isFinite(ts) ? (ts > 1e12 ? "ms" : "s") : null;
  const tsMs = Number.isFinite(ts) ? (unidade === "ms" ? ts : ts * 1000) : null;
  const sigs = h.signature ? extrairAssinaturas(h.signature) : [];
  const diag: Diagnostico = {
    timestampLido: Number.isFinite(ts) ? ts : null, unidadeTimestamp: unidade, idadeS: tsMs != null ? Math.round((agoraMs - tsMs) / 1000) : null,
    assinaturasRecebidas: sigs.length, formatos: sigs.map((x) => x.formato), tamanhoCorpo: Buffer.byteLength(corpoBruto, "utf8"),
    sha256Corpo: createHash("sha256").update(corpoBruto).digest("hex"), bateuComCorpoSozinho: false, segredoTamanho: segredo.length,
  };
  if (!segredo) return { ok: false, motivo: "segredo vazio no ambiente (ZENITH_WEBHOOK_SECRET)", diag };
  const faltando = [!h.eventId && "X-Zenith-Event-Id", !h.timestamp && "X-Zenith-Timestamp", !h.signature && "X-Zenith-Signature"].filter(Boolean);
  if (faltando.length) return { ok: false, motivo: `header faltando: ${faltando.join(", ")}`, diag };
  if (tsMs == null) return { ok: false, motivo: `timestamp inválido: "${h.timestamp}"`, diag };
  if (Math.abs(agoraMs - tsMs) > IDADE_MAXIMA_S * 1000) return { ok: false, motivo: `timestamp fora da janela de ${IDADE_MAXIMA_S} s (idade ${diag.idadeS} s)`, diag };
  const usaveis = sigs.filter((x) => x.formato === "hex" || x.formato === "base64");
  if (usaveis.length === 0) return { ok: false, motivo: `assinatura em formato não reconhecido (${sigs.map((x) => x.formato).join(", ") || "vazio"})`, diag };

  const tsHeader = h.timestamp!.trim();
  const candidatos: [string, Buffer][] = [
    ["ts.corpo", createHmac("sha256", segredo).update(`${tsHeader}.${corpoBruto}`).digest()],
  ];
  // se veio em ms, também tenta assinando com a versão em segundos (e vice-versa)
  if (unidade === "ms") candidatos.push(["ts(s).corpo", createHmac("sha256", segredo).update(`${Math.floor(ts / 1000)}.${corpoBruto}`).digest()]);
  if (unidade === "s") candidatos.push(["ts(ms).corpo", createHmac("sha256", segredo).update(`${ts * 1000}.${corpoBruto}`).digest()]);
  const soCorpo = createHmac("sha256", segredo).update(corpoBruto).digest();
  for (const s of usaveis) {
    for (const [nome, esperado] of candidatos) if (igual(esperado, s.buf)) return { ok: true, variante: `${nome} ${s.formato}`, diag };
    if (igual(soCorpo, s.buf)) diag.bateuComCorpoSozinho = true;
  }
  if (diag.bateuComCorpoSozinho) return { ok: true, variante: "corpo sozinho (sem timestamp)", diag };
  return { ok: false, motivo: "assinatura não confere", diag };
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
  // identidade = id da venda na Zenith (= id_venda do CSV) > referenceId > id do evento.
  // Todos os outros ids do payload (paymentId, checkoutId, depositId, payment.id, checkout.id, reference…) viram ids alternativos:
  // é o que liga deposit.credited ↔ payment.captured/checkout.succeeded do mesmo pagamento.
  const principais = [g(d, "id", "paymentId", "checkoutId", "depositId"), g(d, "referenceId", "reference_id", "reference"), g(d, "saleId", "orderId")].filter(Boolean).map(String);
  const candidatos = [...new Set([...principais, ...coletarIds(d)])];
  const identidade = candidatos[0] ?? eventId;
  const amountRaw = g(d, "amount", "amountCents", "value");
  const amount = typeof amountRaw === "number" ? amountRaw : typeof amountRaw === "string" ? Number(amountRaw) : NaN;
  const ehReembolso = tipo === "payment.refunded" || tipo === "payment.chargeback";
  if (!Number.isFinite(amount) && !ehReembolso) return { ok: false, motivo: "campo amount ausente ou inválido", desconhecido: true };
  const moeda = String(g(d, "currency") ?? "MXN").toUpperCase() === "BRL" ? "BRL" : "MXN";
  const quando = tsParaDate(g(d, "createdAt", "created_at", "capturedAt", "creditedAt", "paidAt", "occurredAt") as string | number | undefined)
    ?? tsParaDate(timestampHeader ?? undefined) ?? new Date();
  const bruto = Number.isFinite(amount) ? amount / 100 : 0; // centavos → unidades
  const produtoRaw = g(d, "productName", "product_name", "infoproduct", "infoproductName", "checkoutName", "description", "concept", "title")
    ?? (d.product as { name?: string; title?: string } | undefined)?.name ?? (d.product as { title?: string } | undefined)?.title
    ?? (d.checkout as { name?: string; title?: string } | undefined)?.name ?? (d.checkout as { title?: string } | undefined)?.title
    ?? (Array.isArray(d.items) ? (d.items[0] as { name?: string; title?: string } | undefined)?.name ?? (d.items[0] as { title?: string } | undefined)?.title : undefined)
    ?? (d.metadata as { product?: string; plan?: string } | undefined)?.product ?? (d.metadata as { plan?: string } | undefined)?.plan;
  const produto = typeof produtoRaw === "string" && produtoRaw.trim() ? produtoRaw.trim() : null;
  const metodo = String(g(d, "paymentMethod", "method") ?? (tipo === "deposit.credited" ? "spei" : ""));
  const familia = tipo === "deposit.credited" ? "deposito" : "pagamento";
  const base = { id: identidade, moeda: moeda as "MXN" | "BRL", bruto, produto, ids: candidatos, payload: { eventoId: eventId, tipo, familia, metodo, data: d } };
  if ((TIPOS_APROVACAO as readonly string[]).includes(tipo)) {
    return { ok: true, identidade, descricao: `${tipo}${metodo ? ` (${metodo})` : ""}`, venda: { ...base, status: "aprovada", criadaEm: quando, aprovadaEm: quando } };
  }
  if (tipo === "payment.pending") return { ok: true, identidade, descricao: tipo, venda: { ...base, status: "pendente", criadaEm: quando, aprovadaEm: null } };
  const quandoReembolso = tsParaDate(g(d, "refundedAt", "refunded_at", "chargebackAt", "occurredAt") as string | number | undefined) ?? quando;
  return { ok: true, identidade, descricao: tipo, venda: { ...base, status: tipo === "payment.chargeback" ? "chargeback" : "reembolsada", criadaEm: null, aprovadaEm: null, reembolsadaEm: quandoReembolso } };
}

/** Varre o payload (até 3 níveis) e devolve todo valor de campo cujo nome termina em "id"/"Id"/"reference" (sem o id do cliente/CLABE). */
export function coletarIds(obj: unknown, nivel = 0): string[] {
  if (!obj || typeof obj !== "object" || nivel > 3) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (/customer|client|clabe|account|bank|card/i.test(k)) continue;
    if ((typeof v === "string" || typeof v === "number") && /(^id$|id$|_id$|reference$|referencia$)/i.test(k) && String(v).length >= 4) out.push(String(v));
    else if (v && typeof v === "object") out.push(...coletarIds(v, nivel + 1));
  }
  return out;
}

function tsParaDate(x: string | number | undefined): Date | null {
  if (x === undefined || x === null || x === "") return null;
  if (typeof x === "number" || /^\d+$/.test(String(x))) { const n = Number(x); return new Date(n > 1e12 ? n : n * 1000); }
  const d = new Date(String(x));
  return Number.isNaN(d.getTime()) ? null : d;
}
