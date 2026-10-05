import {
  pgTable, serial, text, timestamp, numeric, boolean, integer, jsonb,
  uniqueIndex, index, pgEnum, date,
} from "drizzle-orm/pg-core";

// ---------- usuários e login ----------
export const papelEnum = pgEnum("papel", ["edita", "ve"]);

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  usuario: text("usuario").notNull().unique(),
  nome: text("nome").notNull(),
  senhaHash: text("senha_hash").notNull(),
  papel: papelEnum("papel").notNull().default("ve"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const tentativasLogin = pgTable("tentativas_login", {
  id: serial("id").primaryKey(),
  chave: text("chave").notNull(), // ip|usuario
  em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
  sucesso: boolean("sucesso").notNull().default(false),
}, (t) => [index("tentativas_chave_em").on(t.chave, t.em)]);

// ---------- parâmetros com vigência ----------
// chave: imposto_meta_pct, taxa_zenith_pct, taxa_zenith_fixa_mxn, taxa_zenith_fixa_brl,
//        cambio_zenith_pct, imposto_lucro_pct, imposto_lucro_base (a|b|c), marco_zero (ISO), reserva_zenith_pct
export const parametros = pgTable("parametros", {
  id: serial("id").primaryKey(),
  chave: text("chave").notNull(),
  valor: text("valor").notNull(), // guardado como texto: número ou enum; interpretado pela chave
  vigenciaInicio: timestamp("vigencia_inicio", { withTimezone: true }).notNull(),
  vigenciaFim: timestamp("vigencia_fim", { withTimezone: true }), // nulo = vigente
  observacao: text("observacao"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("parametros_chave_inicio").on(t.chave, t.vigenciaInicio)]);

// ---------- frentes e campanhas ----------
export const frentes = pgTable("frentes", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  regraCampanha: text("regra_campanha").notNull(), // regex (case-insensitive) sobre o nome da campanha
  ativa: boolean("ativa").notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
});

export const campanhas = pgTable("campanhas", {
  id: serial("id").primaryKey(),
  contaId: text("conta_id").notNull(), // act_...
  campanhaId: text("campanha_id").notNull(),
  nome: text("nome").notNull(),
  status: text("status"),
  numeroWhatsapp: text("numero_whatsapp"), // 9302 / 8699 / 6699
  frenteId: integer("frente_id").references(() => frentes.id),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("campanhas_conta_campanha").on(t.contaId, t.campanhaId)]);

// ---------- lançamentos lidos das fontes (custos) ----------
// fonte: meta | openai | kie | zapdata | cambio ; tipo: gasto_anuncio | uso_ia | saldo_ia | mensalidade
export const lancamentos = pgTable("lancamentos", {
  id: serial("id").primaryKey(),
  fonte: text("fonte").notNull(),
  tipo: text("tipo").notNull(),
  chaveNatural: text("chave_natural").notNull(), // fonte+campanha+instante, fonte+instante+modelo...
  instante: timestamp("instante", { withTimezone: true }).notNull(), // início do bucket, UTC
  granularidade: text("granularidade").notNull(), // minuto | hora | dia | intervalo
  descricao: text("descricao").notNull(),
  valorOriginal: numeric("valor_original", { precision: 18, scale: 6 }).notNull(),
  moeda: text("moeda").notNull(), // BRL | USD | MXN
  valorBrl: numeric("valor_brl", { precision: 18, scale: 6 }).notNull(),
  taxaCambio: numeric("taxa_cambio", { precision: 18, scale: 8 }).notNull(), // 1 se BRL
  contaId: text("conta_id"),
  campanhaId: text("campanha_id"),
  modelo: text("modelo"),
  idOrigem: text("id_origem"),
  historico: boolean("historico").notNull().default(false),
  estimado: boolean("estimado").notNull().default(false), // ex.: custo OpenAI rateado por hora
  payload: jsonb("payload"),
  coletadoEm: timestamp("coletado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("lancamentos_chave").on(t.chaveNatural),
  index("lancamentos_instante").on(t.instante),
  index("lancamentos_fonte_instante").on(t.fonte, t.instante),
  index("lancamentos_fonte_tipo_instante").on(t.fonte, t.tipo, t.instante),
]);

// ---------- vendas ----------
export const statusVendaEnum = pgEnum("status_venda", ["aprovada", "pendente", "reembolsada", "chargeback", "cancelada"]);

export const vendas = pgTable("vendas", {
  id: serial("id").primaryKey(),
  fonte: text("fonte").notNull(), // zenith | manual
  idOrigem: text("id_origem").notNull(),
  status: statusVendaEnum("status").notNull(),
  criadaEm: timestamp("criada_em", { withTimezone: true }), // quando a venda surgiu (pendente)
  aprovadaEm: timestamp("aprovada_em", { withTimezone: true }), // data que vale para receita
  reembolsadaEm: timestamp("reembolsada_em", { withTimezone: true }), // data que vale para a linha negativa
  produto: text("produto"),
  moeda: text("moeda").notNull().default("MXN"),
  brutoOriginal: numeric("bruto_original", { precision: 18, scale: 6 }).notNull(),
  taxaCambio: numeric("taxa_cambio", { precision: 18, scale: 8 }).notNull(), // MXN→BRL usada (BRL estimado da Zenith)
  brutoBrl: numeric("bruto_brl", { precision: 18, scale: 6 }).notNull(),
  taxaPctBrl: numeric("taxa_pct_brl", { precision: 18, scale: 6 }).notNull().default("0"),
  taxaFixaBrl: numeric("taxa_fixa_brl", { precision: 18, scale: 6 }).notNull().default("0"),
  cambioPctBrl: numeric("cambio_pct_brl", { precision: 18, scale: 6 }).notNull().default("0"),
  liquidoBrl: numeric("liquido_brl", { precision: 18, scale: 6 }).notNull(), // bruto − taxas (antes da reserva)
  reservaBrl: numeric("reserva_brl", { precision: 18, scale: 6 }).notNull().default("0"), // retida, não é custo
  reservaLiberadaEm: timestamp("reserva_liberada_em", { withTimezone: true }),
  historico: boolean("historico").notNull().default(false),
  observacao: text("observacao"),
  payload: jsonb("payload"),
  coletadoEm: timestamp("coletado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("vendas_fonte_id").on(t.fonte, t.idOrigem),
  index("vendas_aprovada").on(t.aprovadaEm),
  index("vendas_reembolsada").on(t.reembolsadaEm),
  index("vendas_status_criada").on(t.status, t.criadaEm),
  index("vendas_fonte_status").on(t.fonte, t.status),
]);

// ---------- lançamentos manuais (saída/entrada, única ou recorrente) ----------
export const tipoManualEnum = pgEnum("tipo_manual", ["saida", "entrada"]);
export const frequenciaEnum = pgEnum("frequencia", ["unica", "diaria", "semanal", "mensal", "trimestral", "semestral", "anual"]);

export const linhaDreEnum = pgEnum("linha_dre", ["zapdata", "ia", "operacao"]);

export const categorias = pgTable("categorias", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  linhaDre: linhaDreEnum("linha_dre").notNull().default("operacao"), // em qual linha da DRE a categoria entra
  ordem: integer("ordem").notNull().default(0),
});

export const lancamentosManuais = pgTable("lancamentos_manuais", {
  id: serial("id").primaryKey(),
  tipo: tipoManualEnum("tipo").notNull(),
  moeda: text("moeda").notNull(), // BRL | MXN | USD
  valor: numeric("valor", { precision: 18, scale: 6 }).notNull(),
  categoriaId: integer("categoria_id").references(() => categorias.id),
  descricao: text("descricao").notNull(),
  frequencia: frequenciaEnum("frequencia").notNull().default("unica"),
  comecaEm: timestamp("comeca_em", { withTimezone: true }).notNull(),
  terminaEm: timestamp("termina_em", { withTimezone: true }),
  ativo: boolean("ativo").notNull().default(true),
  criadoPor: integer("criado_por").references(() => usuarios.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- câmbio ----------
export const cambio = pgTable("cambio", {
  id: serial("id").primaryKey(),
  dia: date("dia").notNull(), // dia de referência (Brasília)
  par: text("par").notNull(), // USDBRL | MXNBRL
  taxa: numeric("taxa", { precision: 18, scale: 8 }).notNull(),
  fonte: text("fonte").notNull(), // ptax | zenith | manual
  provisoria: boolean("provisoria").notNull().default(false),
  coletadoEm: timestamp("coletado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("cambio_dia_par").on(t.dia, t.par)]);

// ---------- coletas e avisos ----------
export const coletas = pgTable("coletas", {
  id: serial("id").primaryKey(),
  fonte: text("fonte").notNull(),
  iniciadaEm: timestamp("iniciada_em", { withTimezone: true }).notNull().defaultNow(),
  terminadaEm: timestamp("terminada_em", { withTimezone: true }),
  ok: boolean("ok"),
  registros: integer("registros").notNull().default(0),
  erro: text("erro"),
  detalhe: jsonb("detalhe"),
}, (t) => [index("coletas_fonte_inicio").on(t.fonte, t.iniciadaEm), index("coletas_fonte_ok_inicio").on(t.fonte, t.ok, t.iniciadaEm)]);

export const avisos = pgTable("avisos", {
  id: serial("id").primaryKey(),
  tipo: text("tipo").notNull(), // fonte_atrasada | coleta_falhou | sanidade | parametro_vencido | recarga_detectada
  fonte: text("fonte"),
  mensagem: text("mensagem").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  resolvidoEm: timestamp("resolvido_em", { withTimezone: true }),
});

// ---------- eventos recebidos da Zenith (auditoria + idempotência por X-Zenith-Event-Id) ----------
export const zenithEventos = pgTable("zenith_eventos", {
  id: serial("id").primaryKey(),
  eventoId: text("evento_id").notNull().unique(), // X-Zenith-Event-Id
  tipo: text("tipo").notNull(), // X-Zenith-Event-Type / body.type
  timestampZenith: timestamp("timestamp_zenith", { withTimezone: true }),
  recebidoEm: timestamp("recebido_em", { withTimezone: true }).notNull().defaultNow(),
  assinaturaOk: boolean("assinatura_ok").notNull().default(false),
  processado: boolean("processado").notNull().default(false),
  resultado: text("resultado"), // ex.: "venda Z123 aprovada", "ignorado: tipo desconhecido", erro
  vendaIdOrigem: text("venda_id_origem"),
  payload: jsonb("payload").notNull(), // corpo bruto (JSON) — sem dados de cartão (a Zenith não envia PAN)
}, (t) => [index("zenith_eventos_recebido").on(t.recebidoEm), index("zenith_eventos_pendentes").on(t.assinaturaOk, t.processado)]);

export const visoesSalvas = pgTable("visoes_salvas", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  query: text("query").notNull(), // querystring do período
  usuarioId: integer("usuario_id").references(() => usuarios.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
