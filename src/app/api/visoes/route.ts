import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getSessao } from "@/lib/auth/sessao";
import { eq } from "drizzle-orm";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const s = await getSessao();
  if (!s.usuarioId) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const { nome, query } = await req.json();
  if (!nome || typeof query !== "string") return NextResponse.json({ erro: "dados inválidos" }, { status: 400 });
  await db.insert(schema.visoesSalvas).values({ nome: String(nome).slice(0, 60), query, usuarioId: s.usuarioId });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: Request) {
  const s = await getSessao();
  if (!s.usuarioId) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const { id } = await req.json();
  await db.delete(schema.visoesSalvas).where(eq(schema.visoesSalvas.id, Number(id)));
  return NextResponse.json({ ok: true });
}
