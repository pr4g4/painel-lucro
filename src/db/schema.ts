/**
 * Esquema do banco. Regras que valem para toda tabela:
 *  - instantes sempre em timestamptz (UTC no banco; fuso só na exibição);
 *  - dinheiro em numeric (nunca float), com moeda original e valor em BRL;
 *  - toda linha lida de fonte externa tem chave única para idempotência.
 */
import {
  pgTable, pgEnum, serial, bigserial, text, boolean, integer, numeric,
  timestamp, date, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";

export const papelEnum = pgEnum("papel", ["edita", "ve"]);
export const fonteEnum = pgEnum("fonte", [
  "meta", "zenith", "openai", "kie", "zapdata", "cambio", "manual", "venda_manual",
]);
export const tipoLancamentoEnum = pgEnum("tipo_lancamento", [
  "gasto_ads", "receita", "reembolso", "ia", "saida", "entrada",
]);
export const granularidadeEnum = pgEnum("granularidade", ["minuto", "hora", "dia", "mes"]);
export const statusVendaEnum = pgEnum("status_venda", [
  "aprovada", "pendente", "reembolsada", "chargeback", "cancelada",
]);
export const tipoManualEnum = pgEnum("tipo_manual", ["saida", "entrada"]);
export const frequenciaEnum = pgEnum("frequencia", [
  "unica", "diaria", "semanal", "mensal", "trimestral", "semestral", "anual",
]);
export const statusManualEnum = pgEnum("status_manual", ["ativo", "pausado"]);
export const statusColetaEnum = pgEnum("status_coleta", ["ok", "erro", "parcial"]);

const dinheiro = (nome: string) => numeric(nome, { precision: 18, scale: 6 });
const taxa = (nome: string) => numeric(nome, { precision: 18, scale: 8 });
const quando = (nome: string) => timestamp(nome, { withTimezone: true, mode: "date" });

// ---------- acesso ----------
export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  usuario: text("usuario").notNull().unique(),
  nome: text("nome").notNull(),
  senhaHash: text("senha_hash").notNull(),
  papel: papelEnum("papel").notNull().default("ve"),
  criadoEm: quando("criado_em").notNull().defaultNow(),
});

export const sessoes = pgTable("sessoes", {
  // hash SHA-256 do token; o token em si só vive no cookie httpOnly
  tokenHash: text("token_hash").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
  expiraEm: quando("expira_em").notNull(),
  criadoEm: quando("criado_em").notNull().defaultNow(),
});

export const tentativasLogin = pgTable("tentativas_login", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  chave: text("chave").notNull(), // ip|usuario
  quando: quando("quando").notNull().defaultNow(),
}, (t) => [index("tentativas_login_chave_idx").on(t.chave, t.quando)]);

// ---------- cadastro ----------
export const frentes = pgTable("frentes", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  // expressão regular aplicada ao nome da campanha na Meta (case-insensitive)
  regraCampanha: text("regra_campanha").notNull(),
  ativa: boolean("ativa").notNull().default(true),
  encerradaEm: quando("encerrada_em"),
});

/**
 * Parâmetros com vigência. Um mesmo `chave` pode ter várias linhas, cada uma
 * valendo de `vigenciaInicio` (inclusive) até `vigenciaFim` (exclusive; nulo = aberta).
 * O cálculo de qualquer lançamento usa a linha vigente no instante do lançamento.
 */
export const parametros = pgTable("parametros", {
  id: serial("id").primaryKey(),
  chave: text("chave").notNull(),
  valor: taxa("valor"),          // número (percentual em %, valor em moeda…)
  texto: text("texto"),          // opção textual (ex.: base do imposto)
  moeda: text("moeda"),          // quando o valor é dinheiro
  vigenciaInicio: quando("vigencia_inicio").notNull(),
  vigenciaFim: quando("vigencia_fim"),
  descricao: text("descricao"),
  criadoEm: quando("criado_em").notNull().defaultNow(),
}, (t) => [index("parametros_chave_vig_idx").on(t.chave, t.vigenciaInicio)]);

export const categorias = pgTable("categorias", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  ordem: integer("ordem").notNull().default(0),
});

// ---------- fatos lidos das fontes ----------
export const cambio = pgTable("cambio", {
  id: serial("id").primaryKey(),
  moeda: text("moeda").notNull(),          // USD, MXN
  data: date("data", { mode: "string" }).notNull(),
  taxaBrl: taxa("taxa_brl").notNull(),     // 1 unidade da moeda em BRL
  fonte: text("fonte").notNull(),          // ptax_fechamento, zenith_estimado, ultima_conhecida
  provisorio: boolean("provisorio").notNull().default(false),
  atualizadoEm: quando("atualizado_em").notNull().defaultNow(),
}, (t) => [uniqueIndex("cambio_moeda_data_uq").on(t.moeda, t.data)]);

export const campanhas = pgTable("campanhas", {
  id: text("id").primaryKey(),             // id da campanha na Meta
  conta: text("conta").notNull(),          // act_...
  nome: text("nome").notNull(),
  status: text("status"),
  numeroWhatsapp: text("numero_whatsapp"), // 9302 / 8699 / 6699
  frenteId: integer("frente_id").references(() => frentes.id),
  atualizadoEm: quando("atualizado_em").notNull().defaultNow(),
});

/** Fato unificado: tudo que entra ou sai, na menor granularidade que a fonte deu. */
export const lancamentos = pgTable("lancamentos", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fonte: fonteEnum("fonte").notNull(),
  tipo: tipoLancamentoEnum("tipo").notNull(),
  instante: quando("instante").notNull(),  // início do intervalo medido
  granularidade: granularidadeEnum("granularidade").notNull(),
  descricao: text("descricao"),
  valorOriginal: dinheiro("valor_original").notNull(),
  moeda: text("moeda").notNull(),
  valorBrl: dinheiro("valor_brl"),         // nulo = câmbio ainda não disponível
  taxaCambio: taxa("taxa_cambio"),
  status: text("status"),
  idOrigem: text("id_origem"),
  conta: text("conta"),
  campanhaId: text("campanha_id"),
  frenteId: integer("frente_id").references(() => frentes.id),
  modelo: text("modelo"),
  historico: boolean("historico").notNull().default(false),
  detalhes: jsonb("detalhes"),
  // idempotência: fonte+id_venda | fonte+conta+campanha+instante | fonte+instante+modelo
  chaveUnica: text("chave_unica").notNull(),
  criadoEm: quando("criado_em").notNull().defaultNow(),
  atualizadoEm: quando("atualizado_em").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("lancamentos_chave_uq").on(t.chaveUnica),
  index("lancamentos_instante_idx").on(t.instante),
  index("lancamentos_fonte_instante_idx").on(t.fonte, t.instante),
]);

export const vendas = pgTable("vendas", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fonte: fonteEnum("fonte").notNull(),     // zenith | venda_manual
  idOrigem: text("id_origem").notNull(),
  criadaEm: quando("criada_em"),           // quando a venda foi gerada na origem
  aprovadaEm: quando("aprovada_em"),       // data que vale para a receita
  status: statusVendaEnum("status").notNull(),
  moeda: text("moeda").notNull(),          // MXN normalmente
  bruto: dinheiro("bruto").notNull(),
  taxaPct: taxa("taxa_pct"),
  taxaFixa: dinheiro("taxa_fixa"),
  cambioPct: taxa("cambio_pct"),
  liquidoListado: dinheiro("liquido_listado"),   // o que a fonte mostra como líquido
  reserva: dinheiro("reserva"),                  // retida, não é custo
  liquidoBrl: dinheiro("liquido_brl"),           // receita líquida (reserva somada de volta)
  taxaMxnBrl: taxa("taxa_mxn_brl"),              // "BRL estimado" ÷ bruto
  produto: text("produto"),
  reembolsada: boolean("reembolsada").notNull().default(false),
  reembolsadaEm: quando("reembolsada_em"),
  valorReembolsoBrl: dinheiro("valor_reembolso_brl"),
  historico: boolean("historico").notNull().default(false),
  observacao: text("observacao"),
  detalhes: jsonb("detalhes"),
  criadoEm: quando("criado_em").notNull().defaultNow(),
  atualizadoEm: quando("atualizado_em").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("vendas_fonte_origem_uq").on(t.fonte, t.idOrigem),
  index("vendas_aprovada_idx").on(t.aprovadaEm),
]);

// ---------- lançados pela tela ----------
export const lancamentosManuais = pgTable("lancamentos_manuais", {
  id: serial("id").primaryKey(),
  tipo: tipoManualEnum("tipo").notNull(),
  moeda: text("moeda").notNull(),          // BRL | MXN | USD
  valor: dinheiro("valor").notNull(),
  categoriaId: integer("categoria_id").references(() => categorias.id),
  descricao: text("descricao").notNull(),
  frequencia: frequenciaEnum("frequencia").notNull().default("unica"),
  comecaEm: quando("comeca_em").notNull(),
  terminaEm: quando("termina_em"),
  status: statusManualEnum("status").notNull().default("ativo"),
  criadoPor: integer("criado_por").references(() => usuarios.id),
  criadoEm: quando("criado_em").notNull().defaultNow(),
  atualizadoEm: quando("atualizado_em").notNull().defaultNow(),
});

// ---------- operação ----------
export const avisos = pgTable("avisos", {
  id: serial("id").primaryKey(),
  tipo: text("tipo").notNull(),            // fonte_atrasada, coleta_falhou, sanidade, parametro_vencido
  fonte: text("fonte"),
  mensagem: text("mensagem").notNull(),
  criadoEm: quando("criado_em").notNull().defaultNow(),
  resolvidoEm: quando("resolvido_em"),
});

export const coletaLog = pgTable("coleta_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fonte: text("fonte").notNull(),
  inicio: quando("inicio").notNull().defaultNow(),
  fim: quando("fim"),
  status: statusColetaEnum("status"),
  itens: integer("itens"),
  erro: text("erro"),
}, (t) => [index("coleta_log_fonte_inicio_idx").on(t.fonte, t.inicio)]);

export const visoesSalvas = pgTable("visoes_salvas", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuarios.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  consulta: text("consulta").notNull(),    // querystring do período/filtros
  criadoEm: quando("criado_em").notNull().defaultNow(),
});
