CREATE TYPE "public"."frequencia" AS ENUM('unica', 'diaria', 'semanal', 'mensal', 'trimestral', 'semestral', 'anual');--> statement-breakpoint
CREATE TYPE "public"."linha_dre" AS ENUM('zapdata', 'ia', 'operacao');--> statement-breakpoint
CREATE TYPE "public"."papel" AS ENUM('edita', 've');--> statement-breakpoint
CREATE TYPE "public"."status_venda" AS ENUM('aprovada', 'pendente', 'reembolsada', 'chargeback', 'cancelada');--> statement-breakpoint
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
	"dia" date NOT NULL,
	"par" text NOT NULL,
	"taxa" numeric(18, 8) NOT NULL,
	"fonte" text NOT NULL,
	"provisoria" boolean DEFAULT false NOT NULL,
	"coletado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campanhas" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" text NOT NULL,
	"campanha_id" text NOT NULL,
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
	"linha_dre" "linha_dre" DEFAULT 'operacao' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categorias_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "coletas" (
	"id" serial PRIMARY KEY NOT NULL,
	"fonte" text NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"terminada_em" timestamp with time zone,
	"ok" boolean,
	"registros" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"detalhe" jsonb
);
--> statement-breakpoint
CREATE TABLE "frentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"regra_campanha" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "frentes_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
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
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parametros" (
	"id" serial PRIMARY KEY NOT NULL,
	"chave" text NOT NULL,
	"valor" text NOT NULL,
	"vigencia_inicio" timestamp with time zone NOT NULL,
	"vigencia_fim" timestamp with time zone,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tentativas_login" (
	"id" serial PRIMARY KEY NOT NULL,
	"chave" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"sucesso" boolean DEFAULT false NOT NULL
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
--> statement-breakpoint
CREATE TABLE "visoes_salvas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"query" text NOT NULL,
	"usuario_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_frente_id_frentes_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_manuais" ADD CONSTRAINT "lancamentos_manuais_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos_manuais" ADD CONSTRAINT "lancamentos_manuais_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visoes_salvas" ADD CONSTRAINT "visoes_salvas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cambio_dia_par" ON "cambio" USING btree ("dia","par");--> statement-breakpoint
CREATE UNIQUE INDEX "campanhas_conta_campanha" ON "campanhas" USING btree ("conta_id","campanha_id");--> statement-breakpoint
CREATE INDEX "coletas_fonte_inicio" ON "coletas" USING btree ("fonte","iniciada_em");--> statement-breakpoint
CREATE UNIQUE INDEX "lancamentos_chave" ON "lancamentos" USING btree ("chave_natural");--> statement-breakpoint
CREATE INDEX "lancamentos_instante" ON "lancamentos" USING btree ("instante");--> statement-breakpoint
CREATE INDEX "lancamentos_fonte_instante" ON "lancamentos" USING btree ("fonte","instante");--> statement-breakpoint
CREATE INDEX "parametros_chave_inicio" ON "parametros" USING btree ("chave","vigencia_inicio");--> statement-breakpoint
CREATE INDEX "tentativas_chave_em" ON "tentativas_login" USING btree ("chave","em");--> statement-breakpoint
CREATE UNIQUE INDEX "vendas_fonte_id" ON "vendas" USING btree ("fonte","id_origem");--> statement-breakpoint
CREATE INDEX "vendas_aprovada" ON "vendas" USING btree ("aprovada_em");--> statement-breakpoint
CREATE INDEX "vendas_reembolsada" ON "vendas" USING btree ("reembolsada_em");