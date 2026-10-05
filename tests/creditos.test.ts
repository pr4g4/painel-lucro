import { describe, it, expect } from "vitest";
import { saldoKie, saldoOpenAI, alertaSaldo, type LancamentoCalc } from "../src/lib/calculo";

const agora = new Date("2026-10-05T03:00:00Z"); // 00:00 BRT de 05/10
const inicioHoje = new Date("2026-10-05T03:00:00Z");
let seq = 0;
const L = (fonte: string, tipo: string, iso: string, valor: number): LancamentoCalc => ({ id: ++seq, fonte, tipo, instante: new Date(iso), granularidade: "minuto", descricao: tipo, valorBrl: 0, valorOriginal: valor, moeda: tipo === "saldo_ia" ? "CRED" : "USD", contaId: null, campanhaId: null, modelo: null, frente: null, historico: false, estimado: false });

describe("créditos kie.ai", () => {
  it("saldo real em créditos e US$, consumo 1 h / hoje, ritmo 3 h e duração; recargas inferidas de hoje", () => {
    const hojeIni = new Date("2026-10-04T03:00:00Z"); // teste com 'hoje' = 04/10 BRT, agora 23:55 BRT
    const ag = new Date("2026-10-05T02:55:00Z");
    const l = [
      L("kie", "saldo_ia", "2026-10-05T02:30:00Z", 1058), L("kie", "saldo_ia", "2026-10-05T02:50:00Z", 1004),
      L("kie", "uso_ia", "2026-10-05T02:30:00Z", 0.27), // 54 créditos
      L("kie", "uso_ia", "2026-10-05T00:30:00Z", 1.00), L("kie", "uso_ia", "2026-10-04T20:00:00Z", 2.00), // 2h30 atrás (dentro das 3 h) e 7 h atrás (hoje)
      L("kie", "recarga_ia", "2026-10-04T22:00:00Z", 1000),
    ];
    const s = saldoKie(l, ag, hojeIni, 0.005);
    expect(s.saldoCreditos).toBe(1004); expect(s.saldoUsd).toBeCloseTo(5.02, 6); expect(s.lidoEm).toEqual(new Date("2026-10-05T02:50:00Z"));
    expect(s.usoUltimaHoraUsd).toBeCloseTo(0.27, 6);
    expect(s.usoHojeUsd).toBeCloseTo(3.27, 6);
    expect(s.ritmoUsdPorHora).toBeCloseTo(1.27 / 3, 6);
    expect(s.horasRestantes).toBeCloseTo(5.02 / (1.27 / 3), 4);
    expect(s.recargasHojeQtd).toBe(1); expect(s.recargasHojeUsd).toBeCloseTo(5, 6);
    expect(saldoKie([], ag, hojeIni, 0.005).indisponivel).toMatch(/leitura/);
    expect(saldoKie(l, ag, hojeIni, null).indisponivel).toMatch(/kie_usd_por_credito/);
  });
});

describe("créditos OpenAI (estimado)", () => {
  it("saldo = referência + recargas depois − custo desde a referência; referência nova zera o erro", () => {
    const l = [
      L("openai", "saldo_ref", "2026-10-05T02:48:00Z", 8.03),
      L("openai", "uso_ia", "2026-10-05T02:00:00Z", 1.00), // antes da referência: não desconta
      L("openai", "uso_ia", "2026-10-05T02:50:00Z", 0.50),
      L("openai", "recarga_ia", "2026-10-05T02:55:00Z", 10),
      L("openai", "uso_ia", "2026-10-05T03:30:00Z", 0.70),
    ];
    const ag = new Date("2026-10-05T04:00:00Z");
    const s = saldoOpenAI(l, ag, inicioHoje);
    expect(s.estimado).toBe(true);
    expect(s.saldoUsd).toBeCloseTo(8.03 + 10 - 1.20, 6);
    expect(s.referencia).toMatchObject({ valorUsd: 8.03, recargasDepoisUsd: 10, custoDepoisUsd: 1.2 });
    expect(s.usoUltimaHoraUsd).toBeCloseTo(0.70, 6);
    expect(s.usoHojeUsd).toBeCloseTo(0.70, 6); // hoje = desde 00:00 BRT (03:00Z)
    expect(s.ritmoUsdPorHora).toBeCloseTo(2.2 / 3, 6); // consumo das últimas 3 h inclui a hora anterior à referência
    expect(s.horasRestantes).toBeCloseTo((8.03 + 10 - 1.2) / (2.2 / 3), 4);
    const nova = saldoOpenAI([...l, L("openai", "saldo_ref", "2026-10-05T03:50:00Z", 15.00)], ag, inicioHoje);
    expect(nova.saldoUsd).toBeCloseTo(15.00, 6); // só o que veio depois das 03:50 (nada) desconta
    expect(saldoOpenAI([], ag, inicioHoje).indisponivel).toMatch(/referência/);
  });
});

describe("alerta de saldo", () => {
  it("abaixo de US$ N ou de N horas; sem consumo nas 3 h não alerta por horas", () => {
    const base = saldoOpenAI([L("openai", "saldo_ref", "2026-10-05T02:48:00Z", 2.5)], agora, inicioHoje);
    expect(alertaSaldo(base, { horas: 6, usd: 3 })).toMatch(/abaixo de US\$ 3/);
    const comUso = saldoOpenAI([L("openai", "saldo_ref", "2026-10-05T02:48:00Z", 10), L("openai", "uso_ia", "2026-10-05T02:50:00Z", 5)], agora, inicioHoje);
    expect(alertaSaldo(comUso, { horas: 6, usd: 3 })).toMatch(/acaba em ~3\.0 h/); // 5 US$ restantes a 5/3 US$/h = 3 h
    const folgado = saldoOpenAI([L("openai", "saldo_ref", "2026-10-05T02:48:00Z", 50), L("openai", "uso_ia", "2026-10-05T02:50:00Z", 0.3)], agora, inicioHoje);
    expect(alertaSaldo(folgado, { horas: 6, usd: 3 })).toBeNull();
    expect(alertaSaldo(saldoOpenAI([], agora, inicioHoje), { horas: 6, usd: 3 })).toBeNull();
  });
});
