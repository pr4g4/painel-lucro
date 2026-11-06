-- Tipo do orçamento da campanha: "dia" (por dia) ou "vitalicio" (orçamento total). Aplicada sozinha pelo app (src/db/esquema.ts).
ALTER TABLE "campanhas" ADD COLUMN IF NOT EXISTS "orcamento_tipo" text;
