import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth/sessao";
import { lerVivo } from "@/lib/resumos";

export const dynamic = "force-dynamic";

/** Estado de hoje para a página inicial "viva": lê a linha minúscula "vivo:hoje" gravada pela coleta (nada de cálculo aqui). */
export async function GET() {
  const s = await getSessao();
  if (!s.usuarioId) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const v = await lerVivo().catch(() => null);
  if (!v) return NextResponse.json({ erro: "sem resumo ainda" }, { status: 404 });
  return NextResponse.json(v);
}
