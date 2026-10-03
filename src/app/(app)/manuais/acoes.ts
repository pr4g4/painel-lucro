"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { db, schema } from "@/db";
import { exigirSessao } from "@/lib/auth/sessao";

const FREQ = ["unica", "diaria", "semanal", "mensal", "trimestral", "semestral", "anual"] as const;
const num = (s: FormDataEntryValue | null) => Number(String(s ?? "").replace(",", "."));

export async function salvarManual(form: FormData) {
  const s = await exigirSessao("edita");
  const tz = String(form.get("tz") || "America/Sao_Paulo");
  const id = form.get("id") ? Number(form.get("id")) : null;
  const valor = num(form.get("valor"));
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("valor inválido");
  const freq = String(form.get("frequencia")) as (typeof FREQ)[number];
  const termina = String(form.get("terminaEm") || "");
  const dados = {
    tipo: (form.get("tipo") === "entrada" ? "entrada" : "saida") as "saida" | "entrada",
    moeda: ["BRL", "MXN", "USD"].includes(String(form.get("moeda"))) ? String(form.get("moeda")) : "BRL",
    valor: String(valor),
    categoriaId: form.get("categoriaId") ? Number(form.get("categoriaId")) : null,
    descricao: String(form.get("descricao") ?? "").trim() || "(sem descrição)",
    frequencia: FREQ.includes(freq) ? freq : "unica",
    comecaEm: fromZonedTime(String(form.get("comecaEm")), tz),
    terminaEm: termina ? fromZonedTime(termina, tz) : null,
    ativo: form.get("ativo") !== "pausado",
  };
  if (id) await db.update(schema.lancamentosManuais).set(dados).where(eq(schema.lancamentosManuais.id, id));
  else await db.insert(schema.lancamentosManuais).values({ ...dados, criadoPor: s.usuarioId });
  revalidatePath("/"); revalidatePath("/manuais"); revalidatePath("/dre");
}

export async function excluirManual(form: FormData) {
  await exigirSessao("edita");
  await db.delete(schema.lancamentosManuais).where(eq(schema.lancamentosManuais.id, Number(form.get("id"))));
  revalidatePath("/"); revalidatePath("/manuais");
}

export async function salvarCategoria(form: FormData) {
  await exigirSessao("edita");
  const nome = String(form.get("nome") ?? "").trim();
  const linhaDre = (["zapdata", "ia", "operacao"].includes(String(form.get("linhaDre"))) ? String(form.get("linhaDre")) : "operacao") as "zapdata" | "ia" | "operacao";
  if (!nome) return;
  const id = form.get("id") ? Number(form.get("id")) : null;
  if (id) await db.update(schema.categorias).set({ nome, linhaDre }).where(eq(schema.categorias.id, id));
  else await db.insert(schema.categorias).values({ nome, linhaDre }).onConflictDoNothing();
  revalidatePath("/manuais");
}

export async function excluirCategoria(form: FormData) {
  await exigirSessao("edita");
  const id = Number(form.get("id"));
  await db.update(schema.lancamentosManuais).set({ categoriaId: null }).where(eq(schema.lancamentosManuais.categoriaId, id));
  await db.delete(schema.categorias).where(eq(schema.categorias.id, id));
  revalidatePath("/manuais");
}
