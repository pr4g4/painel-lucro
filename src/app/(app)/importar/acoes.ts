"use server";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/lib/auth/sessao";
import { lerCsvZenith, importarVendasZenith } from "@/coletores/zenith";

export async function importarCsv(_prev: { ok?: boolean; mensagem?: string } | undefined, form: FormData): Promise<{ ok?: boolean; mensagem?: string }> {
  await exigirSessao("edita");
  const arquivo = form.get("arquivo");
  const colado = String(form.get("csv") ?? "");
  const texto = arquivo instanceof File && arquivo.size > 0 ? await arquivo.text() : colado;
  if (!texto.trim()) return { ok: false, mensagem: "Envie um arquivo CSV ou cole o conteúdo." };
  const vendas = lerCsvZenith(texto);
  if (!vendas.length) return { ok: false, mensagem: "Não encontrei linhas de venda no CSV (precisa de cabeçalho com id, status, data/aprovado_em, bruto…)." };
  const r = await importarVendasZenith(vendas, "zenith");
  revalidatePath("/"); revalidatePath("/dre"); revalidatePath("/lancamentos");
  return r.ok ? { ok: true, mensagem: `${r.registros} venda(s) importadas/atualizadas (idempotente por id).` } : { ok: false, mensagem: `Falhou: ${r.erro}` };
}
