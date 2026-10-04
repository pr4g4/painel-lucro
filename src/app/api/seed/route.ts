import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { gerarHash } from "@/lib/auth/senha";
import { PARAMETROS_PADRAO } from "@/lib/calculo";

export const dynamic = "force-dynamic";

/** Seed de produção sem instalar nada: cria o que não existe (usuários, parâmetros, frentes, categorias, ZapData). Exige CRON_SECRET. */
export async function GET(req: NextRequest) {
  const seg = req.nextUrl.searchParams.get("segredo") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || seg !== process.env.CRON_SECRET) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const feito: string[] = [];
  const inicio = new Date("2026-09-01T03:00:00Z");
  for (const [usuario, nome, papel, env] of [["erick", "Erick", "edita", "SEED_SENHA_ERICK"], ["ian", "Ian", "ve", "SEED_SENHA_IAN"]] as const) {
    const [existe] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario)).limit(1);
    if (existe) continue;
    const senha = process.env[env];
    if (!senha) { feito.push(`${usuario}: defina ${env}`); continue; }
    await db.insert(schema.usuarios).values({ usuario, nome, papel, senhaHash: await gerarHash(senha) }); feito.push(`usuário ${usuario} criado`);
  }
  for (const [chave, { valor, observacao }] of Object.entries(PARAMETROS_PADRAO)) {
    const [existe] = await db.select().from(schema.parametros).where(eq(schema.parametros.chave, chave)).limit(1);
    if (!existe) { await db.insert(schema.parametros).values({ chave, valor, observacao, vigenciaInicio: inicio }); feito.push(`parâmetro ${chave}`); }
  }
  for (const f of [{ nome: "Fotos IA MX", regraCampanha: "REST\\.?\\s*FOTO|FOTOS? IA", ativa: true, ordem: 1 }, { nome: "Cenas Ligeras", regraCampanha: "CENAS\\s*LIGERAS", ativa: false, ordem: 2 }, { nome: "Embarazo", regraCampanha: "EMBARAZO", ativa: false, ordem: 3 }])
    await db.insert(schema.frentes).values(f).onConflictDoNothing();
  for (const [nome, linhaDre] of [["ZapData", "zapdata"], ["tráfego pago", "operacao"], ["softwares e aplicativos", "operacao"], ["IA", "ia"], ["contabilidade", "operacao"], ["operação", "operacao"], ["outros", "operacao"]] as const)
    await db.insert(schema.categorias).values({ nome, linhaDre }).onConflictDoNothing();
  const [cat] = await db.select().from(schema.categorias).where(eq(schema.categorias.nome, "ZapData"));
  const [zap] = await db.select().from(schema.lancamentosManuais).where(eq(schema.lancamentosManuais.descricao, "ZapData mensalidade")).limit(1);
  if (!zap) { await db.insert(schema.lancamentosManuais).values({ tipo: "saida", moeda: "BRL", valor: "119", categoriaId: cat.id, descricao: "ZapData mensalidade", frequencia: "mensal", comecaEm: new Date("2026-10-02T03:00:00Z"), ativo: true }); feito.push("ZapData recorrente"); }
  return NextResponse.json({ ok: true, feito });
}
