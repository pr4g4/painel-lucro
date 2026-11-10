import { describe, it, expect } from "vitest";
import { pedacosDaJanela } from "../src/lib/dados";

describe("pedaços do cache de lançamentos (10/11: saída de rede do Supabase)", () => {
  const tz = "America/Sao_Paulo";
  const d = (s: string) => new Date(`${s}T03:00:00Z`); // meia-noite de Brasília
  it("desde o marco zero até hoje: blocos de 7 dias passados + dias soltos do bloco atual, hoje/ontem como recentes", () => {
    const p = pedacosDaJanela(d("2026-10-03"), new Date("2026-11-10T15:00:00Z"), "2026-11-10", tz);
    expect(p.filter((x) => x.tipo === "bloco").map((x) => x.dia)).toEqual(["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
    expect(p.filter((x) => x.tipo === "dia-antigo").map((x) => x.dia)).toEqual(["2026-11-07", "2026-11-08"]);
    expect(p.filter((x) => x.tipo === "dia-recente").map((x) => x.dia)).toEqual(["2026-11-09", "2026-11-10"]);
    // cobertura sem buraco nem sobra
    const dias = new Set<string>();
    for (const x of p) { for (let i = 0; i < (x.tipo === "bloco" ? 7 : 1); i++) { const dd = new Date(`${x.dia}T12:00:00Z`); dd.setUTCDate(dd.getUTCDate() + i); dias.add(dd.toISOString().slice(0, 10)); } }
    expect(dias.size).toBe(39); expect(dias.has("2026-10-03")).toBe(true); expect(dias.has("2026-11-10")).toBe(true); expect(dias.has("2026-11-11")).toBe(false);
  });
  it("janela só de hoje: um pedaço recente; janela no meio de um bloco passado: dias antigos soltos", () => {
    expect(pedacosDaJanela(d("2026-11-10"), new Date("2026-11-10T20:00:00Z"), "2026-11-10", tz)).toEqual([{ tipo: "dia-recente", dia: "2026-11-10" }]);
    const meio = pedacosDaJanela(d("2026-10-12"), d("2026-10-15"), "2026-11-10", tz);
    expect(meio).toEqual([{ tipo: "dia-antigo", dia: "2026-10-12" }, { tipo: "dia-antigo", dia: "2026-10-13" }, { tipo: "dia-antigo", dia: "2026-10-14" }]);
  });
});
