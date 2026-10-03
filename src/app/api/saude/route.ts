import { NextResponse } from "next/server";
import { db, garantirConexao } from "@/db";
import { sql } from "drizzle-orm";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await garantirConexao(); await db.execute(sql`select 1`); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ ok: false, erro: String(e) }, { status: 500 }); }
}
