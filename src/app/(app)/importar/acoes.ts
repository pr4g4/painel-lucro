"use server";
import { revalidatePath } from "next/cache";
import { invalidarDados } from "@/lib/cache";
import { exigirSessao } from "@/lib/auth/sessao";
import { lerCsvZenithAuto, importarVendasZenith, ehCsvExportZenith, lerCsvExportZenith, conciliarPorReferencia } from "@/coletores/zenith";

export async function importarCsv(_prev: { ok?: boolean; mensagem?: string } | undefined, form: FormData): Promise<{ ok?: boolean; mensagem?: string }> {
  await exigirSessao("edita");
  const arquivo = form.get("arquivo");
  const colado = String(form.get("csv") ?? "");
  const texto = arquivo instanceof File && arquivo.size > 0 ? await arquivo.text() : colado;
  if (!texto.trim()) return { ok: false, mensagem: "Envie um arquivo CSV ou cole o conteúdo." };
  if (ehCsvExportZenith(texto)) {
    // formato novo ("Exportar" na tela de vendas): só concilia status pela referência
    const linhas = lerCsvExportZenith(texto);
    if (!linhas.length) return { ok: false, mensagem: "CSV de exportação sem linhas com referência." };
    const r = await conciliarPorReferencia(linhas);
    revalidatePath("/"); invalidarDados(); revalidatePath("/dre"); revalidatePath("/lancamentos");
    const partes = [`${r.total} linha(s) do CSV de exportação da Zenith.`, `${r.atualizadas.length} status atualizado(s)${r.atualizadas.length ? `: ${r.atualizadas.slice(0, 10).join(", ")}${r.atualizadas.length > 10 ? "…" : ""}` : ""}.`, `${r.jaIguais} já estavam iguais.`];
    if (r.naoEncontradas.length) partes.push(`${r.naoEncontradas.length} referência(s) que o painel NÃO tem (webhook não entregou; importe o CSV de Conciliação, que traz data e taxas): ${r.naoEncontradas.slice(0, 20).join(", ")}${r.naoEncontradas.length > 20 ? "…" : ""}.`);
    if (r.valorDiferente.length) partes.push(`Valor diferente em ${r.valorDiferente.length}: ${r.valorDiferente.slice(0, 5).join("; ")}.`);
    if (r.limite200) partes.push("ATENÇÃO: o arquivo tem exatamente 200 linhas — a Zenith corta nas 200 vendas mais recentes; exporte dia por dia para não perder vendas.");
    return { ok: true, mensagem: partes.join(" ") };
  }
  const vendas = lerCsvZenithAuto(texto);
  if (!vendas.length) return { ok: false, mensagem: "Não encontrei linhas de venda no CSV (esperado o arquivo de Conciliação da Zenith, com id_venda; ou um CSV com id, status, data, bruto…)." };
  const r = await importarVendasZenith(vendas, "zenith");
  revalidatePath("/"); invalidarDados(); revalidatePath("/dre"); revalidatePath("/lancamentos");
  const aprovadas = vendas.filter((v) => v.status === "aprovada").length, pendentes = vendas.filter((v) => v.status === "pendente").length;
  return r.ok ? { ok: true, mensagem: `${r.registros} venda(s) importadas/atualizadas: ${aprovadas} aprovada(s), ${pendentes} pendente(s), ${vendas.length - aprovadas - pendentes} outra(s). Importar de novo não duplica.` } : { ok: false, mensagem: `Falhou: ${r.erro}` };
}

/** CSV do TikTok Ads Manager: gasto por campanha por dia (ou hora), na moeda da conta. */
export async function importarCsvTikTokAcao(_prev: { ok?: boolean; mensagem?: string } | undefined, form: FormData): Promise<{ ok?: boolean; mensagem?: string }> {
  await exigirSessao("edita");
  const { lerCsvTikTok, importarCsvTikTok } = await import("@/coletores/tiktok");
  const arquivo = form.get("arquivo");
  const colado = String(form.get("csv") ?? "");
  const moeda = ["USD", "MXN", "BRL"].includes(String(form.get("moeda"))) ? String(form.get("moeda")) : "USD";
  const texto = arquivo instanceof File && arquivo.size > 0 ? await arquivo.text() : colado;
  if (!texto.trim()) return { ok: false, mensagem: "Envie o arquivo exportado do TikTok Ads Manager ou cole o conteúdo." };
  const linhas = lerCsvTikTok(texto);
  if (!linhas.length) return { ok: false, mensagem: "Não encontrei colunas de campanha, data e custo no arquivo. Exporte o relatório do Ads Manager com as colunas Nome da campanha, Data (por dia ou por hora) e Custo." };
  const r = await importarCsvTikTok(linhas, moeda);
  revalidatePath("/"); invalidarDados(); revalidatePath("/dre"); revalidatePath("/campanhas"); revalidatePath("/lancamentos");
  const total = linhas.reduce((s, l) => s + l.custo, 0);
  const dias = new Set(linhas.map((l) => l.quando.toISOString().slice(0, 10)));
  const ign = Number((r.detalhe as { ignoradasJaNaApi?: number } | undefined)?.ignoradasJaNaApi ?? 0);
  return r.ok ? { ok: true, mensagem: `${r.registros} linha(s) do TikTok gravadas de ${linhas.length} (${dias.size} dia(s), total ${moeda} ${total.toFixed(2)}, ${linhas[0].granularidade === "hora" ? "por hora" : "por dia"}).${ign ? ` ${ign} linha(s) ignorada(s): a API já trouxe essa campanha nesse dia.` : ""} Importar de novo não duplica.` } : { ok: false, mensagem: `Falhou: ${r.erro}` };
}
