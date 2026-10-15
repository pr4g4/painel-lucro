import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, banco: "ok", agora: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, banco: "erro", erro: String(e) }, { status: 503 });
  }
}
