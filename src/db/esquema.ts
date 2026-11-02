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
  { migracao: "0001_zenith_eventos.sql", item: "tabela zenith_eventos", existe: "select 1 from information_schema.tables where table_name = 'zenith_eventos'", comando: `CREATE TABLE IF NOT EXISTS zenith_eventos (id serial PRIMARY KEY NOT NULL, evento_id text NOT NULL, tipo text NOT NULL, timestamp_zenith timestamp with time zone, recebido_em timestamp with time zone DEFAULT now() NOT NULL, assinatura_ok boolean DEFAULT false NOT NULL, processado boolean DEFAULT false NOT NULL, resultado text, venda_id_origem text, payload jsonb NOT NULL, CONSTRAINT zenith_eventos_evento_id_unique UNIQUE(evento_id)); CREATE INDEX IF NOT EXISTS zenith_eventos_recebido ON zenith_eventos USING btree (recebido_em)` },
  { migracao: "0003_alertas.sql", item: "tabela alertas", existe: "select 1 from information_schema.tables where table_name = 'alertas'", comando: `CREATE TABLE IF NOT EXISTS alertas (id serial PRIMARY KEY NOT NULL, chave text NOT NULL, tipo text NOT NULL, estado text DEFAULT 'aberto' NOT NULL, mensagem text NOT NULL, aberto_em timestamp with time zone DEFAULT now() NOT NULL, ultimo_envio_em timestamp with time zone, resolvido_em timestamp with time zone, envios integer DEFAULT 0 NOT NULL, ultimo_erro text, CONSTRAINT alertas_chave_unique UNIQUE(chave))` },
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
        try {
          for (const cmd of it.comando.split(";").map((c) => c.trim()).filter(Boolean)) await db.execute(sql.raw(cmd));
          // confere de verdade (não confia no sucesso do comando)
          const r2 = (await db.execute(sql.raw(it.existe))) as unknown as unknown[];
          if (r2.length) { aplicados.push(it.item); console.warn(`[esquema] aplicado sozinho: ${it.item} (${it.migracao})`); continue; }
        } catch (e) { console.error(`[esquema] não consegui aplicar "${it.item}" (${it.migracao}):`, e instanceof Error ? `${e.message} ${(e as { cause?: Error }).cause?.message ?? ""}` : e); }
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
