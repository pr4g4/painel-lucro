/**
 * Verifica, no início de cada coleta, se o banco tem tudo o que o código usa (colunas/tabelas/valores de enum das migrações).
 * O que faltar é aplicado com comandos idempotentes (IF NOT EXISTS). Se o banco não deixar, abre aviso "migracao_pendente"
 * (faixa vermelha em todas as páginas) com o arquivo a rodar. Resultado fica 1 h em memória.
 */
import { sql } from "drizzle-orm";
import { db } from "./index";

type Pendencia = { migracao: string; item: string; comando: string };

/** Cada item: como detectar e o comando idempotente que o cria. Toda migração nova entra aqui. */
const ITENS: { migracao: string; item: string; existe: string; comando: string }[] = [
  { migracao: "0001_zenith_eventos.sql", item: "tabela zenith_eventos", existe: "select 1 from information_schema.tables where table_name = 'zenith_eventos'", comando: "" },
  { migracao: "0003_alertas.sql", item: "tabela alertas", existe: "select 1 from information_schema.tables where table_name = 'alertas'", comando: "" },
  { migracao: "0004_aporte_e_ads.sql", item: "coluna campanhas.orcamento_diario", existe: "select 1 from information_schema.columns where table_name = 'campanhas' and column_name = 'orcamento_diario'", comando: "ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS orcamento_diario numeric(14, 2)" },
  { migracao: "0004_aporte_e_ads.sql", item: "coluna campanhas.orcamento_moeda", existe: "select 1 from information_schema.columns where table_name = 'campanhas' and column_name = 'orcamento_moeda'", comando: "ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS orcamento_moeda text" },
  { migracao: "0004_aporte_e_ads.sql", item: "valor 'aporte' no enum tipo_manual", existe: "select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'tipo_manual' and e.enumlabel = 'aporte'", comando: "ALTER TYPE tipo_manual ADD VALUE IF NOT EXISTS 'aporte'" },
];

const g = globalThis as unknown as { __esquemaOk?: number };

export type ResultadoEsquema = { ok: boolean; aplicados: string[]; pendentes: Pendencia[]; erro?: string };

export async function verificarEsquema(forcar = false): Promise<ResultadoEsquema> {
  if (!forcar && g.__esquemaOk && Date.now() - g.__esquemaOk < 3_600_000) return { ok: true, aplicados: [], pendentes: [] };
  const aplicados: string[] = []; const pendentes: Pendencia[] = [];
  try {
    for (const it of ITENS) {
      const r = (await db.execute(sql.raw(it.existe))) as unknown as unknown[];
      if (r.length) continue;
      if (it.comando) {
        try { await db.execute(sql.raw(it.comando)); aplicados.push(it.item); continue; }
        catch (e) { console.error(`[esquema] não consegui aplicar "${it.comando}":`, e instanceof Error ? e.message : e); }
      }
      pendentes.push({ migracao: it.migracao, item: it.item, comando: it.comando });
    }
  } catch (e) { return { ok: false, aplicados, pendentes, erro: e instanceof Error ? e.message : String(e) }; }
  if (!pendentes.length) g.__esquemaOk = Date.now();
  return { ok: pendentes.length === 0, aplicados, pendentes };
}

/** Texto da faixa/aviso: "Migração 0004 pendente: rode drizzle/0004_aporte_e_ads.sql no Supabase (faltam: …)". */
export function mensagemMigracao(p: Pendencia[]): string {
  const porArquivo = new Map<string, string[]>();
  for (const x of p) porArquivo.set(x.migracao, [...(porArquivo.get(x.migracao) ?? []), x.item]);
  return [...porArquivo.entries()].map(([arq, itens]) => `Migração ${arq.slice(0, 4)} pendente: rode drizzle/${arq} no SQL Editor do Supabase (faltam: ${itens.join(", ")})`).join(" · ");
}
