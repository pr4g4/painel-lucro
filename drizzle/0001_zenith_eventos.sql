CREATE TABLE "zenith_eventos" (
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
--> statement-breakpoint
CREATE INDEX "zenith_eventos_recebido" ON "zenith_eventos" USING btree ("recebido_em");