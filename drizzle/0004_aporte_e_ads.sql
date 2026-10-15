-- Aporte de sócio (fora do lucro) nos lançamentos manuais; orçamento diário e métricas de entrega das campanhas.
ALTER TYPE "public"."tipo_manual" ADD VALUE IF NOT EXISTS 'aporte';
ALTER TABLE "campanhas" ADD COLUMN IF NOT EXISTS "orcamento_diario" numeric(14, 2);
ALTER TABLE "campanhas" ADD COLUMN IF NOT EXISTS "orcamento_moeda" text;
