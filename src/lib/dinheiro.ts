/**
 * Aritmética de dinheiro em centavos inteiros? Não: as fontes trazem até 6 casas
 * e o imposto é percentual. Usamos string decimal no banco e `Big`-like simples
 * via Number só na exibição. Toda soma relevante acontece no Postgres (numeric).
 * Aqui ficam apenas conversões e formatação.
 */
export function formatarBrl(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "dado indisponível";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return "dado indisponível";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarMoeda(valor: number | string | null | undefined, moeda: string): string {
  if (valor === null || valor === undefined || valor === "") return "dado indisponível";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return "dado indisponível";
  return n.toLocaleString("pt-BR", { style: "currency", currency: moeda });
}

/** Fator "com imposto" a partir do percentual (12,15% → 1 ÷ 0,8785 = 1,1383…). */
export function fatorComImposto(percentual: number): number {
  return 1 / (1 - percentual / 100);
}
