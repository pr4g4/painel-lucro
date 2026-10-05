CREATE INDEX "coletas_fonte_ok_inicio" ON "coletas" USING btree ("fonte","ok","iniciada_em");--> statement-breakpoint
CREATE INDEX "lancamentos_fonte_tipo_instante" ON "lancamentos" USING btree ("fonte","tipo","instante");--> statement-breakpoint
CREATE INDEX "vendas_status_criada" ON "vendas" USING btree ("status","criada_em");--> statement-breakpoint
CREATE INDEX "vendas_fonte_status" ON "vendas" USING btree ("fonte","status");--> statement-breakpoint
CREATE INDEX "zenith_eventos_pendentes" ON "zenith_eventos" USING btree ("assinatura_ok","processado");