CREATE TYPE "public"."fonte" AS ENUM('meta', 'zenith', 'openai', 'kie', 'zapdata', 'cambio', 'manual', 'venda_manual');--> statement-breakpoint
CREATE TYPE "public"."frequencia" AS ENUM('unica', 'diaria', 'semanal', 'mensal', 'trimestral', 'semestral', 'anual');--> statement-breakpoint
CREATE TYPE "public"."granularidade" AS ENUM('minuto', 'hora', 'dia', 'mes');--> statement-breakpoint
CREATE TYPE "public"."papel" AS ENUM('edita', 've');--> statement-breakpoint
CREATE TYPE "public"."status_coleta" AS ENUM('ok', 'erro', 'parcial');--> statement-breakpoint
CREATE TYPE "public"."status_manual" AS ENUM('ativo', 'pausado');--> statement-breakpoint
CREATE TYPE "public"."status_venda" AS ENUM('aprovada', 'pendente', 'reembolsada', 'chargeback', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."tipo_lancamento" AS ENUM('gasto_ads', 'receita', 'reembolso', 'ia', 'saida', 'entrada');--> statement-breakpoint
CREATE TYPE "public"."tipo_manual" AS ENUM('saida', 'entrada');--> statement-breakpoint
CREATE TABLE "avisos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"fonte" text,
	"mensagem" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cambio" (
	"id" serial PRIMARY KEY NOT NULL,
	"moeda" text NOT NULL,
	"data" date NOT NULL,
	"taxa_brl" numeric(18, 8) NOT NULL,
	"fonte" text NOT NULL,
	"provisorio" boolean DEFAULT false NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campanhas" (
	"id" text PRIMARY KEY NOT NULL,
	"conta" text NOT NULL,
	"nome" text NOT NULL,
	"status" text,
	"numero_whatsapp" text,
	"frente_id" integer,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categorias_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "coleta_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fonte" text NOT NULL,
	"inicio" timestamp with time zone DEFAULT now() NOT NULL,
	"fim" timestamp with time zone,
	"status" "status_coleta",
	"itens" integer,
	"erro" text
);
--> statement-breakpoint
CREATE TABLE "frentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"regra_campanha" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"encerrada_em" timestamp with time zone,
	CONSTRAINT "frentes_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fonte" "fonte" NOT NULL,
	"tipo" "tipo_lancamento" NOT NULL,
	"instante" timestamp with time zone NOT NULL,
	"granularidade" "granularidade" NOT NULL,
	"descricao" text,
	"valor_original" numeric(18, 6) NOT NULL,
	"moeda" text NOT NULL,
	"valor_brl" numeric(18, 6),
	"taxa_cambio" numeric(18, 8),
	"status" text,
	"id_origem" text,
	"conta" text,
	"campanha_id" text,
	"frente_id" integer,
	"modelo" text,
	"historico" boolean DEFAULT false NOT NULL,
	"detalhes" jsonb,
	"chave_unica" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lancamentos_manuais" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "tipo_manual" NOT NULL,
	"moeda" text NOT NULL,
	"valor" numeric(18, 6) NOT NULL,
	"categoria_id" integer,
	"descricao" text NOT NULL,
	"frequencia" "frequencia" DEFAULT 'unica' NOT NULL,
	"comeca_em" timestamp with time zone NOT NULL,
	"termina_em" timestamp with time zone,
	"status" "status_manual" DEFAULT 'ativo' NOT NULL,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parametros" (
	"id" serial PRIMARY KEY NOT NULL,
	"chave" text NOT NULL,
	"valor" numeric(18, 8),
	"texto" text,
	"moeda" text,
	"vigencia_inicio" timestamp with time zone NOT NULL,
	"vigencia_fim" timestamp with time zone,
	"descricao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tentativas_login" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chave" text NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario" text NOT NULL,
	"nome" text NOT NULL,
	"senha_hash" text NOT NULL,
	"papel" "papel" DEFAULT 've' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_usuario_unique" UNIQUE("usuario")
);
--> statement-breakpoint
CREATE TABLE "vendas" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fonte" "fonte" NOT NULL,
	"id_origem" text NOT NULL,
	"criada_em" timestamp with time zone,
	"aprovada_em" timestamp with time zone,
	"status" "status_venda" NOT NULL,
	"moeda" text NOT NULL,
	"bruto" numeric(18, 6) NOT NULL,
	"taxa_pct" numeric(18, 8),
	"taxa_fixa" numeric(18, 6),
	"cambio_pct" numeric(18, 8),
	"liquido_listado" numeric(18, 6),
	"reserva" numeric(18, 6),
	"liquido_brl" numeric(18, 6),
	"taxa_mxn_brl" numeric(18, 8),
	"produto" text,
	"reembolsada" boolean DEFAULT false NOT NULL,
	"reembolsada_em" timestamp with time zone,
	"valor_reembolso_brl" numeric(18, 6),
	"historico" boolean DEFAULT false NOT NULL,
	"observacao" text,
	"detalhes" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visoes_salvas" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"nome" text NOT NULL,
	"consulta" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_frente_id_frentes_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_frente_id_frentes_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_manuais" ADD CONSTRAINT "lancamentos_manuais_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_manuais" ADD CONSTRAINT "lancamentos_manuais_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visoes_salvas" ADD CONSTRAINT "visoes_salvas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cambio_moeda_data_uq" ON "cambio" USING btree ("moeda","data");--> statement-breakpoint
CREATE INDEX "coleta_log_fonte_inicio_idx" ON "coleta_log" USING btree ("fonte","inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "lancamentos_chave_uq" ON "lancamentos" USING btree ("chave_unica");--> statement-breakpoint
CREATE INDEX "lancamentos_instante_idx" ON "lancamentos" USING btree ("instante");--> statement-breakpoint
CREATE INDEX "lancamentos_fonte_instante_idx" ON "lancamentos" USING btree ("fonte","instante");--> statement-breakpoint
CREATE INDEX "parametros_chave_vig_idx" ON "parametros" USING btree ("chave","vigencia_inicio");--> statement-breakpoint
CREATE INDEX "tentativas_login_chave_idx" ON "tentativas_login" USING btree ("chave","quando");--> statement-breakpoint
CREATE UNIQUE INDEX "vendas_fonte_origem_uq" ON "vendas" USING btree ("fonte","id_origem");--> statement-breakpoint
CREATE INDEX "vendas_aprovada_idx" ON "vendas" USING btree ("aprovada_em");