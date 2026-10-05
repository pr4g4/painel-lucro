/**
 * Provedores de envio de WhatsApp (plugáveis). Escolha por WHATSAPP_PROVEDOR: "callmebot" (padrão) ou "zapdata".
 *  - CallMeBot (grátis): WHATSAPP_ALERTA_FONE (ex.: 5547991498006) e CALLMEBOT_APIKEY.
 *  - ZapData/webhook genérico: ZAPDATA_ALERTA_URL (POST JSON { phone, message }) e opcional ZAPDATA_ALERTA_TOKEN (Authorization: Bearer).
 * Sem variáveis: `configurado()` é false e nada é enviado (Avisos mostra "alerta WhatsApp não configurado").
 */
export interface Provedor { nome: string; configurado(): boolean; faltando(): string[]; enviar(texto: string): Promise<void>; }

export const callMeBot: Provedor = {
  nome: "CallMeBot",
  faltando: () => ["WHATSAPP_ALERTA_FONE", "CALLMEBOT_APIKEY"].filter((v) => !process.env[v]),
  configurado() { return this.faltando().length === 0; },
  async enviar(texto) {
    const fone = (process.env.WHATSAPP_ALERTA_FONE ?? "").replace(/\D/g, "");
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(fone)}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(process.env.CALLMEBOT_APIKEY ?? "")}`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const corpo = await r.text();
    if (!r.ok || /error|invalid|not valid/i.test(corpo)) throw new Error(`CallMeBot HTTP ${r.status}: ${corpo.slice(0, 160)}`);
  },
};

export const zapData: Provedor = {
  nome: "ZapData (webhook)",
  faltando: () => ["ZAPDATA_ALERTA_URL", "WHATSAPP_ALERTA_FONE"].filter((v) => !process.env[v]),
  configurado() { return this.faltando().length === 0; },
  async enviar(texto) {
    const r = await fetch(process.env.ZAPDATA_ALERTA_URL!, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/json", ...(process.env.ZAPDATA_ALERTA_TOKEN ? { Authorization: `Bearer ${process.env.ZAPDATA_ALERTA_TOKEN}` } : {}) },
      body: JSON.stringify({ phone: (process.env.WHATSAPP_ALERTA_FONE ?? "").replace(/\D/g, ""), message: texto }),
    });
    if (!r.ok) throw new Error(`ZapData HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  },
};

export function provedorAtual(): Provedor {
  return (process.env.WHATSAPP_PROVEDOR ?? "callmebot").toLowerCase() === "zapdata" ? zapData : callMeBot;
}
