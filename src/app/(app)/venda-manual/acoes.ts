"use server";
import { revalidatePath } from "next/cache";
import { invalidarDados } from "@/lib/cache";
import { fromZonedTime } from "date-fns-tz";
import { exigirSessao } from "@/lib/auth/sessao";
import { normalizarVenda } from "@/coletores/zenith";
import { upsertVendas } from "@/coletores/base";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";

const num = (s: FormDataEntryValue | null) => { const n = Number(String(s ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

export type EstadoGravar = { ok: boolean; mensagem: string } | undefined;

export async function salvarVendaManual(_prev: EstadoGravar, form: FormData): Promise<EstadoGravar> {
  try { return await gravarVenda(form); } catch (e) { return { ok: false, mensagem: `Não gravou: ${e instanceof Error ? e.message : String(e)}` }; }
}

async function gravarVenda(form: FormData): Promise<EstadoGravar> {
  const s = await exigirSessao("edita");
  const tz = String(form.get("tz") || "America/Sao_Paulo");
  const status = String(form.get("status")) as "aprovada" | "reembolsada" | "chargeback";
  const aprovadaEm = fromZonedTime(String(form.get("aprovadaEm")), tz);
  const reembolsadaStr = String(form.get("reembolsadaEm") || "");
  const moeda = form.get("moeda") === "BRL" ? "BRL" : "MXN";
  const bruto = num(form.get("bruto"));
  if (!bruto || bruto <= 0) throw new Error("valor bruto inválido");
  const taxaCobrada = num(form.get("taxaCobrada"));
  const liquido = num(form.get("liquido"));
  const brlEstimado = num(form.get("brlEstimado"));
  const id = String(form.get("id") || `M${Date.now()}`);
  const venda = await normalizarVenda({
    id, status: ["aprovada", "reembolsada", "chargeback"].includes(status) ? status : "aprovada",
    criadaEm: aprovadaEm, aprovadaEm, reembolsadaEm: reembolsadaStr ? fromZonedTime(reembolsadaStr, tz) : (status !== "aprovada" ? aprovadaEm : null),
    moeda, bruto, brlEstimado: moeda === "BRL" ? bruto : brlEstimado,
    // taxa cobrada informada entra como taxa % única; fixa e câmbio ficam 0 para não dobrar
    ...(taxaCobrada != null ? { taxaPct: taxaCobrada, taxaFixa: 0, cambioPct: 0 } : {}),
    ...(liquido != null ? { liquido, reserva: 0 } : {}),
    produto: String(form.get("produto") || "") || null,
    payload: { origem: "manual", usuario: s.usuario, observacao: String(form.get("observacao") || "") },
  }, "manual");
  venda.observacao = String(form.get("observacao") || "") || null;
  await upsertVendas([venda]);
  revalidatePath("/"); invalidarDados(); revalidatePath("/venda-manual"); revalidatePath("/dre"); revalidatePath("/lancamentos");
  return { ok: true, mensagem: `Venda ${id} registrada.` };
}

export async function excluirVendaManual(form: FormData) {
  await exigirSessao("edita");
  await db.delete(schema.vendas).where(and(eq(schema.vendas.fonte, "manual"), eq(schema.vendas.idOrigem, String(form.get("id")))));
  revalidatePath("/"); invalidarDados(); revalidatePath("/venda-manual");
}
