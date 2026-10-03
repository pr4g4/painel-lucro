"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { db, schema } from "@/db";
import { exigirSessao } from "@/lib/auth/sessao";
import { gerarHash } from "@/lib/auth/senha";

/** Nova vigência: fecha a atual no instante informado e abre a nova dali em diante. Período passado não muda. */
export async function novaVigencia(form: FormData) {
  await exigirSessao("edita");
  const chave = String(form.get("chave"));
  const valor = String(form.get("valor") ?? "").trim().replace(",", ".");
  const tz = String(form.get("tz") || "America/Sao_Paulo");
  const inicio = fromZonedTime(String(form.get("inicio")), tz);
  if (!chave || !valor || Number.isNaN(inicio.getTime())) throw new Error("dados inválidos");
  await db.transaction(async (tx) => {
    await tx.update(schema.parametros).set({ vigenciaFim: inicio }).where(and(eq(schema.parametros.chave, chave), isNull(schema.parametros.vigenciaFim)));
    await tx.insert(schema.parametros).values({ chave, valor, vigenciaInicio: inicio, observacao: String(form.get("observacao") || "") || null });
  });
  revalidatePath("/parametros"); revalidatePath("/"); revalidatePath("/dre");
}

export async function salvarFrente(form: FormData) {
  await exigirSessao("edita");
  const nome = String(form.get("nome") ?? "").trim();
  const regra = String(form.get("regraCampanha") ?? "").trim();
  if (!nome || !regra) return;
  try { new RegExp(regra, "i"); } catch { throw new Error("regra inválida (expressão regular)"); }
  const id = form.get("id") ? Number(form.get("id")) : null;
  const dados = { nome, regraCampanha: regra, ativa: form.get("ativa") === "on" };
  if (id) await db.update(schema.frentes).set(dados).where(eq(schema.frentes.id, id));
  else await db.insert(schema.frentes).values(dados);
  // reaplica a regra nas campanhas já coletadas
  const frentes = await db.select().from(schema.frentes).orderBy(schema.frentes.ordem);
  const camps = await db.select().from(schema.campanhas);
  for (const c of camps) {
    const f = frentes.find((fr) => { try { return new RegExp(fr.regraCampanha, "i").test(c.nome); } catch { return false; } });
    await db.update(schema.campanhas).set({ frenteId: f?.id ?? null }).where(eq(schema.campanhas.id, c.id));
  }
  revalidatePath("/parametros"); revalidatePath("/campanhas");
}

export async function trocarSenha(form: FormData) {
  const s = await exigirSessao();
  const nova = String(form.get("nova") ?? "");
  const alvo = String(form.get("usuario") ?? s.usuario);
  if (alvo !== s.usuario && s.papel !== "edita") throw new Error("sem permissão");
  await db.update(schema.usuarios).set({ senhaHash: await gerarHash(nova) }).where(eq(schema.usuarios.usuario, alvo));
  revalidatePath("/parametros");
}
