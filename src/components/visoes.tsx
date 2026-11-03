import Link from "next/link";
import { schema, executar } from "@/db";
import { desc } from "drizzle-orm";
export async function VisoesSalvas() {
  const { lembrar } = await import("@/lib/memoria");
  const v = await lembrar("visoes", () => executar((d) => d.select().from(schema.visoesSalvas).orderBy(desc(schema.visoesSalvas.criadoEm)).limit(20), 6000, "visões"), { ttlMs: 300_000, swr: true, rotulo: "visões" }).catch(() => []);
  if (!v.length) return null;
  return <div className="flex flex-wrap gap-1 text-xs items-center"><span className="text-ink-3">Visões salvas:</span>{v.map((x) => <Link key={x.id} href={`/?${x.query}`} prefetch={false} className="chip">{x.nome}</Link>)}</div>;
}
