import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getSessao } from "@/lib/auth/sessao";
import { executar } from "@/db";
import { estadoMemoria } from "@/lib/memoria";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/diagnostico (só logado): quem impõe statement_timeout, conexões ativas/esperando, consultas mais lentas
 * (pg_stat_statements, se instalada) e o estado da memória da instância. Só leitura; nada de segredos.
 */
export async function GET() {
  const s = await getSessao();
  if (!s.usuarioId) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const q = async <T,>(rotulo: string, texto: string): Promise<T | { erro: string }> => {
    try { return (await executar((d) => d.execute(sql.raw(texto)), 10000, rotulo)) as unknown as T; }
    catch (e) { return { erro: e instanceof Error ? e.message : String(e) }; }
  };
  const t0 = Date.now();
  const [sessao, papeis, atividade, lentas, tamanho] = await Promise.all([
    q("sessão", `select current_user, current_setting('statement_timeout') as statement_timeout, current_setting('lock_timeout') as lock_timeout, current_setting('idle_in_transaction_session_timeout') as idle_in_transaction_session_timeout, inet_server_addr()::text as servidor, version() as versao, now() as agora`),
    q("papéis", `select rolname, rolconfig from pg_roles where rolconfig is not null order by rolname`),
    q("atividade", `select state, wait_event_type, wait_event, count(*) as n, max(extract(epoch from (now() - coalesce(query_start, backend_start))))::int as max_seg, max(left(query, 120)) as exemplo from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() group by 1,2,3 order by n desc`),
    q("lentas", `select calls, round(mean_exec_time::numeric, 1) as media_ms, round(max_exec_time::numeric, 1) as max_ms, round(total_exec_time::numeric, 0) as total_ms, left(query, 160) as query from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database()) order by mean_exec_time desc limit 12`),
    q("tamanho", `select relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze from pg_stat_user_tables order by n_live_tup desc limit 15`),
  ]);
  return NextResponse.json({
    demorouMs: Date.now() - t0,
    sessao, papeis, atividade, lentas, tabelas: tamanho,
    memoriaDaInstancia: estadoMemoria(),
    nota: "statement_timeout aqui é o da sessão que o app recebe do pooler; se vier 8s, é a role/pooler que impõe (o app não define). pg_stat_statements só aparece se a extensão estiver habilitada no Supabase (Database → Extensions).",
  });
}
