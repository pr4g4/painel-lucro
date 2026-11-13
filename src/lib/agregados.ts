/**
 * Leituras AGREGADAS para o cálculo (13/11: a saída de rede do Supabase estourou lendo linha a linha).
 * O motor de cálculo continua o mesmo: ele recebe "linhas" em que cada uma representa VÁRIAS vendas/lançamentos iguais
 * (mesma hora ou dia, mesma moeda, mesmo status…) com `quantidade`. Como todas as fórmulas são somas, o resultado é o mesmo.
 *   - últimas 48 h: pedaços de 1 hora (Meta, TikTok e OpenAI já vêm por hora; vendas recentes ficam com a hora certa);
 *   - antes disso: pedaços de 1 dia (meia-noite de Brasília). Período personalizado que comece no meio de um dia antigo
 *     fica com precisão de dia.
 * Uma consulta de vendas e uma de lançamentos por janela, ~1 KB por dia de dados.
 */
import { sql } from "drizzle-orm";
import { executar } from "@/db";
import type { VendaCalc, LancamentoCalc, StatusVenda } from "@/lib/calculo";

const TZ = process.env.APP_TZ ?? "America/Sao_Paulo";
const PRAZO_MS = 10_000;

/** Fronteira entre "por hora" e "por dia": 48 h antes do fim da janela, na hora cheia. */
export function fronteiraHora(fim: Date): Date {
  const d = new Date(fim.getTime() - 48 * 3_600_000); d.setUTCMinutes(0, 0, 0); return d;
}

export type VendaAgregada = Omit<VendaCalc, "id" | "idOrigem" | "produto" | "taxaCambio" | "reservaLiberadaEm"> & { quantidade: number };
export type LancamentoAgregado = Omit<LancamentoCalc, "id" | "descricao" | "campanhaId" | "modelo" | "frente" | "granularidade"> & { quantidade: number };

/** Vendas desde `ini` (criadas, aprovadas ou reembolsadas a partir daí), agregadas. Duplicadas anuladas pela dedup ficam de fora. */
export async function vendasAgregadas(ini: Date, fim: Date): Promise<VendaAgregada[]> {
  const rec = fronteiraHora(fim).toISOString();
  const q = `select status, moeda, historico, fonte,
      ${pedacoSql("criada_em")} as criada, ${pedacoSql("aprovada_em")} as aprovada, ${pedacoSql("reembolsada_em")} as reembolsada,
      case when status = 'pendente' then lower(coalesce(payload->>'metodo_pagamento', payload->>'metodo', payload->'data'->>'paymentMethod', payload->'data'->>'method')) end as metodo,
      count(*)::int as quantidade,
      sum(bruto_original)::float as bruto_original, sum(bruto_brl)::float as bruto_brl, sum(taxa_pct_brl)::float as taxa_pct_brl, sum(taxa_fixa_brl)::float as taxa_fixa_brl,
      sum(cambio_pct_brl)::float as cambio_pct_brl, sum(liquido_brl)::float as liquido_brl,
      sum(case when status = 'aprovada' and reserva_liberada_em is null then reserva_brl else 0 end)::float as reserva_brl
    from vendas
    where not (status = 'cancelada' and coalesce(observacao, '') like 'duplicada%')
      and (criada_em >= $2::timestamptz or aprovada_em >= $2::timestamptz or reembolsada_em >= $2::timestamptz)
    group by 1, 2, 3, 4, 5, 6, 7, 8`;
  const rows = await executar((d) => d.execute(sql.raw(bind(q, [rec, ini.toISOString()]))), PRAZO_MS, "vendas agregadas") as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    fonte: String(r.fonte), status: String(r.status) as StatusVenda, moeda: String(r.moeda), historico: !!r.historico,
    criadaEm: data(r.criada), aprovadaEm: data(r.aprovada), reembolsadaEm: data(r.reembolsada), metodo: (r.metodo as string | null) ?? null,
    quantidade: Number(r.quantidade), brutoOriginal: Number(r.bruto_original), brutoBrl: Number(r.bruto_brl), taxaPctBrl: Number(r.taxa_pct_brl), taxaFixaBrl: Number(r.taxa_fixa_brl),
    cambioPctBrl: Number(r.cambio_pct_brl), liquidoBrl: Number(r.liquido_brl), reservaBrl: Number(r.reserva_brl),
  }));
}

/** Lançamentos desde `ini`, agregados por pedaço, fonte, tipo, moeda, conta e marcas. */
export async function lancamentosAgregados(ini: Date, fim: Date): Promise<LancamentoAgregado[]> {
  const rec = fronteiraHora(fim).toISOString();
  const q = `select fonte, tipo, moeda, historico, estimado, conta_id, ${pedacoSql("instante")} as instante,
      count(*)::int as quantidade, sum(valor_brl)::float as valor_brl, sum(valor_original)::float as valor_original
    from lancamentos where instante >= $2::timestamptz
    group by 1, 2, 3, 4, 5, 6, 7`;
  const rows = await executar((d) => d.execute(sql.raw(bind(q, [rec, ini.toISOString()]))), PRAZO_MS, "lançamentos agregados") as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    fonte: String(r.fonte), tipo: String(r.tipo), moeda: String(r.moeda), historico: !!r.historico, estimado: !!r.estimado, contaId: (r.conta_id as string | null) ?? null,
    instante: data(r.instante)!, quantidade: Number(r.quantidade), valorBrl: Number(r.valor_brl), valorOriginal: Number(r.valor_original),
  }));
}

/** Converte os agregados em linhas que o motor entende (uma linha = `quantidade` vendas iguais). */
export function paraVendasCalc(xs: VendaAgregada[]): VendaCalc[] {
  return xs.map((x, i) => ({ ...x, id: `agg-${i}`, idOrigem: `agregado:${x.quantidade}`, produto: null, taxaCambio: 0, reservaLiberadaEm: null }));
}
export function paraLancamentosCalc(xs: LancamentoAgregado[]): LancamentoCalc[] {
  return xs.map((x, i) => ({ ...x, id: `agg-${i}`, descricao: `${x.fonte} (${x.quantidade} lançamentos)`, campanhaId: null, modelo: null, frente: null, granularidade: "agregado" }));
}

function pedacoSql(coluna: string): string { return `(case when ${coluna} >= $1::timestamptz then date_trunc('hour', ${coluna}) else date_trunc('day', ${coluna} at time zone '${TZ}') at time zone '${TZ}' end)`; }
/** Parâmetros $1/$2 como literais escapados (só ISO de datas, sem entrada do usuário). */
function bind(q: string, params: string[]): string { return q.replace(/\$(\d)/g, (_, n) => `'${params[Number(n) - 1].replace(/'/g, "")}'`); }
const data = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));
