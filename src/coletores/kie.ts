/**
 * kie.ai: a API pública só expõe o saldo de créditos (GET /api/v1/chat/credit). Não há consumo por dia nem por tarefa.
 * Guardamos cada leitura (tipo `saldo_ia`) e derivamos o uso entre leituras consecutivas × preço por crédito (`kie_usd_por_credito`).
 * Recarga entre duas leituras: o saldo sobe, mas parte do pacote pode já ter sido gasta. Como as recargas vêm em pacotes fixos
 * (`kie_pacote_creditos`, 1.000 créditos = US$ 5), inferimos: pacotes = ceil(subida ÷ pacote); uso = pacotes × pacote − subida.
 * Esse uso fica marcado `estimado` e a recarga é registrada à parte (tipo `recarga_ia`, não é custo).
 * Limitação: uso anterior à primeira leitura (ou enquanto a coleta esteve parada) não é recuperável pela API → lançamento manual em USD, categoria IA.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { executarColeta, upsertLancamentos, taxaDoDia, diaBrasilia, marcoZeroAtual, abrirAviso, type NovoLancamento } from "./base";
import { parametroVigente } from "@/lib/calculo";

export interface KieCliente { saldoCreditos(): Promise<number>; }

export function kieClienteReal(apiKey: string): KieCliente {
  return {
    async saldoCreditos() {
      const r = await fetch("https://api.kie.ai/api/v1/chat/credit", { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const j = await r.json();
      if (!r.ok || j.code !== 200) throw new Error(`kie.ai: ${j.msg ?? r.status}`);
      return Number(j.data);
    },
  };
}

export async function coletarKie(cliente: KieCliente, agora = new Date()) {
  return executarColeta("kie", async () => {
    const marco = await marcoZeroAtual();
    const saldo = await cliente.saldoCreditos();
    const params = (await db.select().from(schema.parametros)).map((p) => ({ chave: p.chave, valor: p.valor, vigenciaInicio: p.vigenciaInicio, vigenciaFim: p.vigenciaFim }));
    const precoParam = parametroVigente(params, "kie_usd_por_credito", agora);
    const usdPorCredito = precoParam ? Number(precoParam.valor) : null;
    const pacoteParam = parametroVigente(params, "kie_pacote_creditos", agora);
    const pacote = pacoteParam ? Number(pacoteParam.valor) : 1000;

    const [anterior] = await db.select().from(schema.lancamentos).where(and(eq(schema.lancamentos.fonte, "kie"), eq(schema.lancamentos.tipo, "saldo_ia"))).orderBy(desc(schema.lancamentos.instante)).limit(1);
    const rows: NovoLancamento[] = [{
      fonte: "kie", tipo: "saldo_ia", chaveNatural: `kie|saldo|${agora.toISOString()}`, instante: agora, granularidade: "minuto", descricao: "kie.ai saldo de créditos",
      valorOriginal: String(saldo), moeda: "CRED", valorBrl: "0", taxaCambio: "0", historico: agora < marco, payload: { saldo },
    }];
    let uso = 0;
    if (anterior) {
      const saldoAnt = Number(anterior.valorOriginal);
      let delta = saldoAnt - saldo; // créditos consumidos no intervalo
      let estimado = false;
      let recargaCreditos = 0;
      if (delta < 0) {
        // recarga no intervalo: pacotes inteiros; o que falta para fechar o pacote foi gasto
        const subida = -delta;
        const pacotes = Math.max(1, Math.ceil(subida / pacote));
        recargaCreditos = pacotes * pacote;
        delta = recargaCreditos - subida;
        estimado = true;
        rows.push({
          fonte: "kie", tipo: "recarga_ia", chaveNatural: `kie|recarga|${agora.toISOString()}`, instante: agora, granularidade: "minuto",
          descricao: `kie.ai recarga inferida: ${pacotes} pacote(s) de ${pacote} créditos (saldo ${saldoAnt} → ${saldo})`,
          valorOriginal: String(recargaCreditos), moeda: "CRED", valorBrl: "0", taxaCambio: "0", historico: agora < marco, estimado: true, payload: { saldoAnt, saldo, pacotes, pacote },
        });
      }
      if (delta > 0) {
        if (usdPorCredito == null) await abrirAviso("parametro_faltando", "kie", "Parâmetro kie_usd_por_credito não cadastrado: uso do kie.ai fica como 'dado indisponível'.");
        else {
          const usd = delta * usdPorCredito;
          const cambio = await taxaDoDia("USDBRL", diaBrasilia(agora));
          if (!cambio) await abrirAviso("sem_cambio", "kie", "Sem taxa USD→BRL para converter uso do kie.ai.");
          else {
            uso = usd;
            // o uso é atribuído ao intervalo [anterior, agora); gravamos no início do intervalo
            rows.push({
              fonte: "kie", tipo: "uso_ia", chaveNatural: `kie|uso|${anterior.instante.toISOString()}`, instante: anterior.instante, granularidade: "intervalo",
              descricao: `kie.ai uso (${delta} créditos${estimado ? `, inferido com recarga de ${recargaCreditos}` : ""})`, valorOriginal: String(usd), moeda: "USD", valorBrl: String(usd * cambio.taxa), taxaCambio: String(cambio.taxa),
              historico: anterior.instante < marco, estimado, payload: { creditos: delta, de: anterior.instante, ate: agora, recargaCreditos },
            });
          }
        }
      }
    }
    const registros = await upsertLancamentos(rows);
    return { registros, detalhe: { saldo, usoUsd: uso } };
  });
}
