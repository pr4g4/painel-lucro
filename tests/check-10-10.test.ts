import { describe, expect, it } from "vitest";
import { planoDoCiclo, explicarErroMeta } from "../src/coletores/meta";
import { saldoOpenAI, alertaSaldo } from "../src/lib/calculo";
import { ehCsvExportZenith, lerCsvExportZenith, lerCsvZenithAuto } from "../src/coletores/zenith";
import { fontesAtrasadas } from "../src/lib/hoje";
import { iaLanc, brt } from "./fixtures";
import type { LancamentoCalc } from "../src/lib/calculo";

describe("Meta: plano do ciclo e erros em português", () => {
  it("ciclo normal só refaz hoje; 06h e 12h (Brasília) refazem ontem; campanhas só no primeiro ciclo da hora; após falha refaz tudo", () => {
    expect(planoDoCiclo(brt("2026-10-10T14:50"), false)).toMatchObject({ refazOntem: false, buscaCampanhas: false });
    expect(planoDoCiclo(brt("2026-10-10T14:03"), false)).toMatchObject({ refazOntem: false, buscaCampanhas: true });
    expect(planoDoCiclo(brt("2026-10-10T06:02"), false)).toMatchObject({ refazOntem: true, buscaCampanhas: true });
    expect(planoDoCiclo(brt("2026-10-10T12:09"), false)).toMatchObject({ refazOntem: true });
    expect(planoDoCiclo(brt("2026-10-10T12:15"), false)).toMatchObject({ refazOntem: false });
    expect(planoDoCiclo(brt("2026-10-10T18:20"), true)).toMatchObject({ refazOntem: true, buscaCampanhas: true, motivo: "recuperação após falha" });
  });
  it("API access blocked vira instrução: confirmar a conta em developers.facebook.com", () => {
    expect(explicarErroMeta({ code: 200, message: "API access blocked", type: "OAuthException" })).toMatch(/developers\.facebook\.com e confirme a conta/);
    expect(explicarErroMeta({ code: 190, message: "Error validating access token" })).toMatch(/token/i);
    expect(explicarErroMeta({ code: 2637, message: "adreport job is not completed yet" })).toMatch(/2637/);
    expect(explicarErroMeta({ code: 100, message: "Invalid parameter" })).toBeNull();
  });
});

describe("OpenAI: estimativa negativa nunca aparece nem alerta", () => {
  const ref = (usd: number, quando: Date): LancamentoCalc => ({ ...iaLanc("openai", quando, usd), tipo: "saldo_ref", granularidade: "instante" });
  const agora = brt("2026-10-10T18:00"), inicioHoje = brt("2026-10-10T00:00");
  it("11,36 + 5 − 31,35 < 0 → 'conferir saldo', sem número, sem alerta", () => {
    const l = [ref(11.36, brt("2026-10-05T01:05")), { ...iaLanc("openai", brt("2026-10-05T00:53"), 5), tipo: "recarga_ia" }, iaLanc("openai", brt("2026-10-08T10:00"), 31.35)];
    const s = saldoOpenAI(l, agora, inicioHoje);
    expect(s.saldoUsd).toBeNull(); expect(s.indisponivel).toMatch(/conferir saldo .*recarga não registrada/); expect(s.referencia?.custoDepoisUsd).toBeCloseTo(31.35);
    expect(alertaSaldo(s, { horas: 6, usd: 3 })).toBeNull();
  });
  it("saldo positivo continua normal", () => {
    const s = saldoOpenAI([ref(20, brt("2026-10-10T01:00")), iaLanc("openai", brt("2026-10-10T16:00"), 3)], agora, inicioHoje);
    expect(s.saldoUsd).toBeCloseTo(17); expect(s.indisponivel).toBeUndefined();
  });
});

describe("Zenith: CSV novo de exportação (só referência e status)", () => {
  const csv = 'referencia,cliente,email,pais,metodo,moeda,status,valor\nREF1,Ana,a@x.mx,MX,SPEI,MXN,Aprovada,"MX$ 149,00"\nREF2,Bia,b@x.mx,MX,OXXO,MXN,Pendente,"MX$ 1.249,00"\n';
  it("detecta o formato e lê valor 'MX$ 1.249,00'", () => {
    expect(ehCsvExportZenith(csv)).toBe(true);
    const l = lerCsvExportZenith(csv);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ referencia: "REF1", status: "aprovada", valor: 149, moeda: "MXN", metodo: "SPEI" });
    expect(l[1]).toMatchObject({ referencia: "REF2", status: "pendente", valor: 1249 });
  });
  it("o CSV de Conciliação (com id_venda e data) continua indo para o importador antigo", () => {
    const conc = '"id_venda";"referencia";"data_hora_brt";"pais";"metodo_pagamento";"status";"moeda";"valor_bruto";"taxa_aplicada";"retencao";"deducoes_totais";"valor_liquido";"status_financeiro"\n"V1";"REF1";"01/10/2026, 03:37:25";"MX";"spei";"CAPTURED";"MXN";"149,00";"";"13,41";"14,90";"120,69";"CONFIRMADO"\n';
    expect(ehCsvExportZenith(conc)).toBe(false);
    expect(lerCsvZenithAuto(conc)).toHaveLength(1);
  });
});

describe("fontes atrasadas (faixa vermelha)", () => {
  const agora = brt("2026-10-10T14:00");
  const c = (ultimaOkMin: number | null, naoConfigurada = false) => ({ ultimaOk: ultimaOkMin == null ? null : new Date(agora.getTime() - ultimaOkMin * 60_000), ultima: agora, erro: null, falhasSeguidas: 0, naoConfigurada });
  it("Meta > 30 min e IAs > 60 min; fonte não configurada não conta; Zenith só com webhook rejeitado", () => {
    const m = new Map([["meta", c(31)], ["openai", c(45)], ["kie", c(61)], ["cambio", c(500)], ["zenith", c(0)]]);
    expect(fontesAtrasadas(m, agora).map((a) => a.fonte)).toEqual(["meta", "kie"]);
    expect(fontesAtrasadas(new Map([["meta", c(200, true)]]), agora)).toHaveLength(0);
    expect(fontesAtrasadas(new Map([["meta", c(5)]]), agora, true).map((a) => a.fonte)).toEqual(["zenith"]);
  });
});
