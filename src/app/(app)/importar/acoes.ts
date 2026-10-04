"use server";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/lib/auth/sessao";
import { lerCsvZenithAuto, importarVendasZenith } from "@/coletores/zenith";

export async function importarCsv(_prev: { ok?: boolean; mensagem?: string } | undefined, form: FormData): Promise<{ ok?: boolean; mensagem?: string }> {
  await exigirSessao("edita");
  const arquivo = form.get("arquivo");
  const colado = String(form.get("csv") ?? "");
  const texto = arquivo instanceof File && arquivo.size > 0 ? await arquivo.text() : colado;
  if (!texto.trim()) return { ok: false, mensagem: "Envie um arquivo CSV ou cole o conteúdo." };
  const vendas = lerCsvZenithAuto(texto);
  if (!vendas.length) return { ok: false, mensagem: "Não encontrei linhas de venda no CSV (esperado o arquivo de Conciliação da Zenith, com id_venda; ou um CSV com id, status, data, bruto…)." };
  const r = await importarVendasZenith(vendas, "zenith");
  revalidatePath("/"); revalidatePath("/dre"); revalidatePath("/lancamentos");
  const aprovadas = vendas.filter((v) => v.status === "aprovada").length, pendentes = vendas.filter((v) => v.status === "pendente").length;
  return r.ok ? { ok: true, mensagem: `${r.registros} venda(s) importadas/atualizadas: ${aprovadas} aprovada(s), ${pendentes} pendente(s), ${vendas.length - aprovadas - pendentes} outra(s). Importar de novo não duplica.` } : { ok: false, mensagem: `Falhou: ${r.erro}` };
}
