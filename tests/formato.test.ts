import { describe, expect, it } from "vitest";
import { fmtUSD, fmtHorasRestantes, pctFazSentido } from "@/lib/formato";

describe("formato pt-BR dos créditos", () => {
  it("US$ com vírgula", () => { expect(fmtUSD(1.51)).toBe("US$ 1,51"); expect(fmtUSD(null)).toBe("—"); });
  it("horas restantes com vírgula", () => { expect(fmtHorasRestantes(1.5)).toBe("~1,5 h"); expect(fmtHorasRestantes(60)).toBe("~2,5 dias"); expect(fmtHorasRestantes(60, true)).toBe("~3 d"); });
});

describe("percentual da variação só quando faz sentido (exibição)", () => {
  it("base quase zero ou troca de sinal: sem %", () => {
    expect(pctFazSentido(-12.63, -0.36)).toBe(false); // -3.401% do print
    expect(pctFazSentido(100, 5)).toBe(false);
    expect(pctFazSentido(1000, 50)).toBe(false); // < 10% do atual
    expect(pctFazSentido(50, -40)).toBe(false);
    expect(pctFazSentido(50, 0)).toBe(false);
    expect(pctFazSentido(50, null)).toBe(false);
  });
  it("base comparável: com %", () => { expect(pctFazSentido(120, 100)).toBe(true); expect(pctFazSentido(-80, -100)).toBe(true); });
});
