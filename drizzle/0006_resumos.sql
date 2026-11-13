-- Resumos prontos da inicial: calculados na coleta, lidos pelas telas (pedido 4, 13/11). Aplicada sozinha pelo app.
CREATE TABLE IF NOT EXISTS "resumos" ("chave" text PRIMARY KEY NOT NULL, "calculado_em" timestamp with time zone DEFAULT now() NOT NULL, "dados" jsonb NOT NULL);
