"use server";
import { fmtUSD } from "@/lib/formato";
import { revalidatePath } from "next/cache";
import { invalidarDados } from "@/lib/cache";
import { fromZonedTime } from "date-fns-tz";
import { schema, executar } from "@/db";
import { exigirSessao } from "@/lib/auth/sessao";
import { verificarSaldos } from "@/coletores/creditos";

const num = (s: FormDataEntryValue | null) => { const n = Number(String(s ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

/** Registra recarga (não é custo) ou saldo conferido (referência que zera o erro do estimado) da OpenAI. */
export async function registrarCreditoOpenAI(_prev: { ok?: boolean; mensagem?: string } | undefined, form: FormData): Promise<{ ok?: boolean; mensagem?: string }> {
  const s = await exigirSessao("edita");
  const tipo = form.get("tipo") === "saldo_ref" ? "saldo_ref" : "recarga_ia";
  const valor = num(form.get("valor"));
  if (valor == null || valor < 0) return { ok: false, mensagem: "Valor inválido." };
  const tz = String(form.get("tz") || "America/Sao_Paulo");
  const quandoStr = String(form.get("quando") || "");
  const quando = quandoStr ? fromZonedTime(quandoStr, tz) : new Date();
  if (Number.isNaN(quando.getTime())) return { ok: false, mensagem: "Data/hora inválida." };
  await executar((d) => d.insert(schema.lancamentos).values({
    fonte: "openai", tipo, chaveNatural: `openai|${tipo}|${quando.toISOString()}`, instante: quando, granularidade: "minuto",
    descricao: tipo === "saldo_ref" ? `OpenAI saldo conferido no painel de Billing: ${fmtUSD(valor)}` : `OpenAI recarga de créditos: ${fmtUSD(valor)}`,
    valorOriginal: String(valor), moeda: "USD", valorBrl: "0", taxaCambio: "0", historico: false, estimado: false, payload: { usuario: s.usuario },
  }).onConflictDoUpdate({ target: schema.lancamentos.chaveNatural, set: { valorOriginal: String(valor), coletadoEm: new Date() } }));
  await verificarSaldos().catch(() => {});
  revalidatePath("/"); invalidarDados(); revalidatePath("/resumo"); revalidatePath("/avisos");
  return { ok: true, mensagem: tipo === "saldo_ref" ? `Referência gravada: ${fmtUSD(valor)}.` : `Recarga de ${fmtUSD(valor)} registrada (não entra como custo).` };
}
