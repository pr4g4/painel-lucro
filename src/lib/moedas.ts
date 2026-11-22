/** Moedas das vendas (22/11: a Zenith passou a vender na Argentina e na Colômbia; a moeda vem em data.currency). */
export const PAIS_DA_MOEDA: Record<string, string> = { MXN: "MX", ARS: "AR", COP: "CO", CLP: "CL", PEN: "PE", USD: "US", BRL: "BR", UYU: "UY", BOB: "BO", PYG: "PY", EUR: "EU" };

/** "ars " → "ARS"; qualquer código de 3 letras é aceito; vazio ou inválido → null (NUNCA cai em MXN). */
export function normalizarMoeda(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const m = x.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(m) ? m : null;
}
export const paisDaMoeda = (m: string) => PAIS_DA_MOEDA[m] ?? m.slice(0, 2);
