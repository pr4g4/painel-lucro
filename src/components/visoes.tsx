import Link from "next/link";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
export async function VisoesSalvas() {
  const v = await db.select().from(schema.visoesSalvas).orderBy(desc(schema.visoesSalvas.criadoEm)).limit(20).catch(() => []);
  if (!v.length) return null;
  return <div className="flex flex-wrap gap-1 text-xs items-center"><span className="text-ink-3">Visões salvas:</span>{v.map((x) => <Link key={x.id} href={`/?${x.query}`} className="chip">{x.nome}</Link>)}</div>;
}
