"use server";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { db, schema } from "@/db";
import { exigirSessao } from "@/lib/auth/sessao";
import { invalidarDados } from "@/lib/cache";

const CHAVE_MARCACAO = "marcacao_robo";
export type EstadoGravar = { ok: boolean; mensagem: string } | undefined;

/** Marcação no gráfico de IA ("mudei o robô às HH:MM"): guardada como parâmetro informativo, sem efeito em cálculo. */
export async function registrarMarcacao(_prev: EstadoGravar, form: FormData): Promise<EstadoGravar> {
  try {
    const s = await exigirSessao("edita");
    const tz = String(form.get("tz") || "America/Sao_Paulo");
    const quando = fromZonedTime(String(form.get("quando")), tz);
    if (Number.isNaN(quando.getTime())) return { ok: false, mensagem: "Data/hora inválida." };
    const texto = String(form.get("texto") || "").trim() || "mudei o robô";
    await db.insert(schema.parametros).values({ chave: CHAVE_MARCACAO, valor: texto.slice(0, 80), vigenciaInicio: quando, vigenciaFim: null, observacao: `marcação de ${s.usuario}` });
    invalidarDados(); revalidatePath("/");
    return { ok: true, mensagem: `Marcação gravada: ${texto}.` };
  } catch (e) { return { ok: false, mensagem: `Não gravou: ${e instanceof Error ? e.message : String(e)}` }; }
}

export async function excluirMarcacao(_prev: EstadoGravar, form: FormData): Promise<EstadoGravar> {
  try {
    await exigirSessao("edita");
    const { and, eq } = await import("drizzle-orm");
    await db.delete(schema.parametros).where(and(eq(schema.parametros.chave, CHAVE_MARCACAO), eq(schema.parametros.id, Number(form.get("id")))));
    invalidarDados(); revalidatePath("/");
    return { ok: true, mensagem: "Marcação removida." };
  } catch (e) { return { ok: false, mensagem: `Não removeu: ${e instanceof Error ? e.message : String(e)}` }; }
}
