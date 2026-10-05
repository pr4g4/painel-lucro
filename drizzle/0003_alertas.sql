CREATE TABLE "alertas" (
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
