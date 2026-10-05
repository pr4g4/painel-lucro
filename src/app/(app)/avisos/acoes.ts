"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { invalidarDados } from "@/lib/cache";
import { db, schema } from "@/db";
import { exigirSessao } from "@/lib/auth/sessao";
export async function resolverAviso(form: FormData) {
  await exigirSessao("edita");
  await db.update(schema.avisos).set({ resolvidoEm: new Date() }).where(eq(schema.avisos.id, Number(form.get("id"))));
  invalidarDados(); revalidatePath("/avisos"); revalidatePath("/");
}
