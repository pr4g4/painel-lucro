/**
 * kie.ai: a API pública só expõe o saldo de créditos. Guardamos cada leitura (tipo `saldo_ia`) e derivamos o uso
 * como a queda de saldo entre leituras consecutivas × preço por crédito (parâmetro `kie_usd_por_credito`).
 * Saldo que sobe = recarga: não vira uso e abre aviso informativo. Chave natural: `kie|instanteLeitura`.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { executarColeta, upsertLancamentos, taxaDoDia, diaBrasilia, marcoZeroAtual, abrirAviso, type NovoLancamento } from "./base";
import { parametroVigente } from "@/lib/calculo";

export interface KieCliente { saldoCreditos(): Promise<number>; }

export function kieClienteReal(apiKey: string): KieCliente {
  return {
    async saldoCreditos() {
      const r = await fetch("https://api.kie.ai/api/v1/chat/credit", { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store" });
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
    const params = await db.select().from(schema.parametros).where(eq(schema.parametros.chave, "kie_usd_por_credito"));
    const precoParam = parametroVigente(params.map((p) => ({ chave: p.chave, valor: p.valor, vigenciaInicio: p.vigenciaInicio, vigenciaFim: p.vigenciaFim })), "kie_usd_por_credito", agora);
    const usdPorCredito = precoParam ? Number(precoParam.valor) : null;

    const [anterior] = await db.select().from(schema.lancamentos).where(and(eq(schema.lancamentos.fonte, "kie"), eq(schema.lancamentos.tipo, "saldo_ia"))).orderBy(desc(schema.lancamentos.instante)).limit(1);
    const rows: NovoLancamento[] = [{
      fonte: "kie", tipo: "saldo_ia", chaveNatural: `kie|saldo|${agora.toISOString()}`, instante: agora, granularidade: "minuto", descricao: "kie.ai saldo de créditos",
      valorOriginal: String(saldo), moeda: "CRED", valorBrl: "0", taxaCambio: "0", historico: agora < marco, payload: { saldo },
    }];
    let uso = 0;
    if (anterior) {
      const saldoAnt = Number(anterior.valorOriginal);
      const delta = saldoAnt - saldo;
      if (delta < 0) await abrirAviso("recarga_detectada", "kie", `Saldo do kie.ai subiu de ${saldoAnt} para ${saldo} créditos (recarga). Não contado como uso.`);
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
              descricao: `kie.ai uso (${delta} créditos)`, valorOriginal: String(usd), moeda: "USD", valorBrl: String(usd * cambio.taxa), taxaCambio: String(cambio.taxa),
              historico: anterior.instante < marco, payload: { creditos: delta, de: anterior.instante, ate: agora },
            });
          }
        }
      }
    }
    const registros = await upsertLancamentos(rows);
    return { registros, detalhe: { saldo, usoUsd: uso } };
  });
}
