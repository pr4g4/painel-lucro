-- PASSO 2 da mudança de banco (docs/mudanca-de-banco.md): cria TODAS as tabelas do painel num projeto Supabase novo e vazio.
-- Cole inteiro no SQL Editor do projeto NOVO e rode uma vez. Gerado a partir de drizzle/0000..0005 (mesma estrutura do banco antigo).
-- Não contém dados nem segredos.

-- ===== drizzle/0000_smiling_darkhawk.sql =====
CREATE TYPE "public"."frequencia" AS ENUM('unica', 'diaria', 'semanal', 'mensal', 'trimestral', 'semestral', 'anual');
CREATE TYPE "public"."linha_dre" AS ENUM('zapdata', 'ia', 'operacao');
CREATE TYPE "public"."papel" AS ENUM('edita', 've');
CREATE TYPE "public"."status_venda" AS ENUM('aprovada', 'pendente', 'reembolsada', 'chargeback', 'cancelada');
CREATE TYPE "public"."tipo_manual" AS ENUM('saida', 'entrada', 'aporte');
CREATE TABLE IF NOT EXISTS "avisos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"fonte" text,
	"mensagem" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvido_em" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "cambio" (
	"id" serial PRIMARY KEY NOT NULL,
	"dia" date NOT NULL,
	"par" text NOT NULL,
	"taxa" numeric(18, 8) NOT NULL,
	"fonte" text NOT NULL,
	"provisoria" boolean DEFAULT false NOT NULL,
	"coletado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "campanhas" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" text NOT NULL,
	"campanha_id" text NOT NULL,
	"nome" text NOT NULL,
	"status" text,
	"numero_whatsapp" text,
	"frente_id" integer,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"linha_dre" "linha_dre" DEFAULT 'operacao' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categorias_nome_unique" UNIQUE("nome")
);

CREATE TABLE IF NOT EXISTS "coletas" (
	"id" serial PRIMARY KEY NOT NULL,
	"fonte" text NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"terminada_em" timestamp with time zone,
	"ok" boolean,
	"registros" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"detalhe" jsonb
);

CREATE TABLE IF NOT EXISTS "frentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"regra_campanha" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "frentes_nome_unique" UNIQUE("nome")
);

CREATE TABLE IF NOT EXISTS "lancamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"fonte" text NOT NULL,
	"tipo" text NOT NULL,
	"chave_natural" text NOT NULL,
	"instante" timestamp with time zone NOT NULL,
	"granularidade" text NOT NULL,
	"descricao" text NOT NULL,
	"valor_original" numeric(18, 6) NOT NULL,
	"moeda" text NOT NULL,
	"valor_brl" numeric(18, 6) NOT NULL,
	"taxa_cambio" numeric(18, 8) NOT NULL,
	"conta_id" text,
	"campanha_id" text,
	"modelo" text,
	"id_origem" text,
	"historico" boolean DEFAULT false NOT NULL,
	"estimado" boolean DEFAULT false NOT NULL,
	"payload" jsonb,
	"coletado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "lancamentos_manuais" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "tipo_manual" NOT NULL,
	"moeda" text NOT NULL,
	"valor" numeric(18, 6) NOT NULL,
	"categoria_id" integer,
	"descricao" text NOT NULL,
	"frequencia" "frequencia" DEFAULT 'unica' NOT NULL,
	"comeca_em" timestamp with time zone NOT NULL,
	"termina_em" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "parametros" (
	"id" serial PRIMARY KEY NOT NULL,
	"chave" text NOT NULL,
	"valor" text NOT NULL,
	"vigencia_inicio" timestamp with time zone NOT NULL,
	"vigencia_fim" timestamp with time zone,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tentativas_login" (
	"id" serial PRIMARY KEY NOT NULL,
	"chave" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"sucesso" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario" text NOT NULL,
	"nome" text NOT NULL,
	"senha_hash" text NOT NULL,
	"papel" "papel" DEFAULT 've' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_usuario_unique" UNIQUE("usuario")
);

CREATE TABLE IF NOT EXISTS "vendas" (
	"id" serial PRIMARY KEY NOT NULL,
	"fonte" text NOT NULL,
	"id_origem" text NOT NULL,
	"status" "status_venda" NOT NULL,
	"criada_em" timestamp with time zone,
	"aprovada_em" timestamp with time zone,
	"reembolsada_em" timestamp with time zone,
	"produto" text,
	"moeda" text DEFAULT 'MXN' NOT NULL,
	"bruto_original" numeric(18, 6) NOT NULL,
	"taxa_cambio" numeric(18, 8) NOT NULL,
	"bruto_brl" numeric(18, 6) NOT NULL,
	"taxa_pct_brl" numeric(18, 6) DEFAULT '0' NOT NULL,
	"taxa_fixa_brl" numeric(18, 6) DEFAULT '0' NOT NULL,
	"cambio_pct_brl" numeric(18, 6) DEFAULT '0' NOT NULL,
	"liquido_brl" numeric(18, 6) NOT NULL,
	"reserva_brl" numeric(18, 6) DEFAULT '0' NOT NULL,
	"reserva_liberada_em" timestamp with time zone,
	"historico" boolean DEFAULT false NOT NULL,
	"observacao" text,
	"payload" jsonb,
	"coletado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "visoes_salvas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"query" text NOT NULL,
	"usuario_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_frente_id_frentes_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "lancamentos_manuais" ADD CONSTRAINT "lancamentos_manuais_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "lancamentos_manuais" ADD CONSTRAINT "lancamentos_manuais_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "visoes_salvas" ADD CONSTRAINT "visoes_salvas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX IF NOT EXISTS "cambio_dia_par" ON "cambio" USING btree ("dia","par");
CREATE UNIQUE INDEX IF NOT EXISTS "campanhas_conta_campanha" ON "campanhas" USING btree ("conta_id","campanha_id");
CREATE INDEX IF NOT EXISTS "coletas_fonte_inicio" ON "coletas" USING btree ("fonte","iniciada_em");
CREATE UNIQUE INDEX IF NOT EXISTS "lancamentos_chave" ON "lancamentos" USING btree ("chave_natural");
CREATE INDEX IF NOT EXISTS "lancamentos_instante" ON "lancamentos" USING btree ("instante");
CREATE INDEX IF NOT EXISTS "lancamentos_fonte_instante" ON "lancamentos" USING btree ("fonte","instante");
CREATE INDEX IF NOT EXISTS "parametros_chave_inicio" ON "parametros" USING btree ("chave","vigencia_inicio");
CREATE INDEX IF NOT EXISTS "tentativas_chave_em" ON "tentativas_login" USING btree ("chave","em");
CREATE UNIQUE INDEX IF NOT EXISTS "vendas_fonte_id" ON "vendas" USING btree ("fonte","id_origem");
CREATE INDEX IF NOT EXISTS "vendas_aprovada" ON "vendas" USING btree ("aprovada_em");
CREATE INDEX IF NOT EXISTS "vendas_reembolsada" ON "vendas" USING btree ("reembolsada_em");

-- ===== drizzle/0001_zenith_eventos.sql =====
CREATE TABLE IF NOT EXISTS "zenith_eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"evento_id" text NOT NULL,
	"tipo" text NOT NULL,
	"timestamp_zenith" timestamp with time zone,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"assinatura_ok" boolean DEFAULT false NOT NULL,
	"processado" boolean DEFAULT false NOT NULL,
	"resultado" text,
	"venda_id_origem" text,
	"payload" jsonb NOT NULL,
	CONSTRAINT "zenith_eventos_evento_id_unique" UNIQUE("evento_id")
);

CREATE INDEX IF NOT EXISTS "zenith_eventos_recebido" ON "zenith_eventos" USING btree ("recebido_em");

-- ===== drizzle/0002_indices_desempenho.sql =====
CREATE INDEX IF NOT EXISTS "coletas_fonte_ok_inicio" ON "coletas" USING btree ("fonte","ok","iniciada_em");
CREATE INDEX IF NOT EXISTS "lancamentos_fonte_tipo_instante" ON "lancamentos" USING btree ("fonte","tipo","instante");
CREATE INDEX IF NOT EXISTS "vendas_status_criada" ON "vendas" USING btree ("status","criada_em");
CREATE INDEX IF NOT EXISTS "vendas_fonte_status" ON "vendas" USING btree ("fonte","status");
CREATE INDEX IF NOT EXISTS "zenith_eventos_pendentes" ON "zenith_eventos" USING btree ("assinatura_ok","processado");

-- ===== drizzle/0003_alertas.sql =====
CREATE TABLE IF NOT EXISTS "alertas" (
	"id" serial PRIMARY KEY NOT NULL,
	"chave" text NOT NULL,
	"tipo" text NOT NULL,
	"estado" text DEFAULT 'aberto' NOT NULL,
	"mensagem" text NOT NULL,
	"aberto_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_envio_em" timestamp with time zone,
	"resolvido_em" timestamp with time zone,
	"envios" integer DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	CONSTRAINT "alertas_chave_unique" UNIQUE("chave")
);

-- ===== drizzle/0004_aporte_e_ads.sql =====
-- Aporte de sócio (fora do lucro) nos lançamentos manuais; orçamento diário e métricas de entrega das campanhas.
ALTER TABLE "campanhas" ADD COLUMN IF NOT EXISTS "orcamento_diario" numeric(14, 2);
ALTER TABLE "campanhas" ADD COLUMN IF NOT EXISTS "orcamento_moeda" text;

-- ===== drizzle/0005_orcamento_tipo.sql =====
-- Tipo do orçamento da campanha: "dia" (por dia) ou "vitalicio" (orçamento total). Aplicada sozinha pelo app (src/db/esquema.ts).
ALTER TABLE "campanhas" ADD COLUMN IF NOT EXISTS "orcamento_tipo" text;
