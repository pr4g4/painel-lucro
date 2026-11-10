/**
 * Aquecimento: depois de cada coleta (que invalida a tag "dados"), refaz as leituras que a página inicial usa, para que elas
 * fiquem no cache compartilhado (Data Cache da Vercel, 60 s, servido "stale-while-revalidate"). Uma instância fria que abra a
 * inicial não vai ao banco: só o tempo de subir a função. Nada aqui muda dados.
 */
import { contextoPeriodo } from "@/lib/contexto";
import { avisosAbertos } from "@/lib/dados";
import { carregarCreditos } from "@/coletores/creditos";
import { dadosHoje } from "@/lib/hoje";

export async function aquecer(): Promise<{ passos: { nome: string; ms: number; erro?: string }[]; totalMs: number }> {
  const t0 = Date.now();
  const passos: { nome: string; ms: number; erro?: string }[] = [];
  const passo = async (nome: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    try { await fn(); passos.push({ nome, ms: Date.now() - t }); }
    catch (e) { passos.push({ nome, ms: Date.now() - t, erro: e instanceof Error ? e.message : String(e) }); }
  };
  // em sequência, de propósito: o banco do plano grátis não aguenta tudo de uma vez
  await passo("créditos", () => carregarCreditos());
  await passo("avisos", () => avisosAbertos());
  await passo("inicial (desde o marco zero)", () => contextoPeriodo({}));
  await passo("inicial (hoje)", () => contextoPeriodo({ p: "hoje" }));
  await passo("barra Hoje", () => dadosHoje());
  return { passos, totalMs: Date.now() - t0 };
}
