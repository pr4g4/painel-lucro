# Pendências (dependem do Erick)

Atualizado em 03/10/2026 (noite). Nada aqui bloqueia o que já está pronto; cada item destrava uma fonte real.

## Bloqueiam fontes reais
1. **Zenith — método de leitura (bloqueia o passo 4).** Abrir o painel da Zenith em Configurações / Integrações / Webhooks (ou Postback) e me dizer: (a) existe webhook por venda? (b) existe exportação CSV com data e hora? (c) a lista mostra líquido, reserva, status pendente, produto e "BRL estimado"? O app já tem o receptor (`/api/zenith/webhook`) e o leitor de CSV (`lerCsvZenith`); falta só saber o formato real. Enquanto isso, vendas entram pela tela **Venda manual**.
2. **Meta — token de usuário de sistema** com escopo `ads_read` (longa duração), colar em `META_TOKEN` na Vercel. Depois eu testo se as contas 00 e 01 entregam hora (síncrono ou assíncrono) ou só dia.
3. **OpenAI — chave de administrador** (`sk-admin-…`, somente leitura de uso/custos) em `OPENAI_ADMIN_KEY`, e o id do projeto "Cenas Ligeras" em `OPENAI_PROJECT_ID`.
4. **kie.ai — API key Default do Ian** em `KIE_API_KEY` **e o preço por crédito em US$** (parâmetro `kie_usd_por_credito` na tela Parâmetros; o exemplo usa 0,005 e está marcado como EXEMPLO). Verificar também se o painel do kie.ai tem log por requisição (daria uso por hora de verdade; hoje é por diferença de saldo).

## Decisões a confirmar
5. **Teste de sanidade do ZapData (R$ 126,68).** Pela fórmula 4 (ciclo dia 2 → dia 1), 12/09–02/10 dá R$ 83,17. O valor 126,68 = 33 dias × R$ 119 ÷ 31, ou seja, uma janela de 33 dias (ex.: 31/08–02/10). Divergência maior que R$ 1,00; implementei a fórmula 4 como escrita. Confirmar qual janela foi usada ou aceitar 83,17 como o número correto para 12/09–02/10.
6. **Reembolso de venda histórica (anterior ao marco zero).** Hoje fica fora da receita (começamos do zero). Se quiser que apareça como linha negativa mesmo assim, é um ajuste de 1 linha.
7. **Imposto Meta: 1 ÷ 0,8785 ou × 1,1383?** Uso o exato (1 ÷ (1 − 12,15%)); diferença de 1 centavo em R$ 315,29 (358,90 vs 358,89). Teste de sanidade passa nos dois.
8. **Vencimento das taxas (reserva, etc.)**: a reserva retida usa o valor que a Zenith informar por venda; o parâmetro `reserva_zenith_pct` (10%) só vale quando a fonte não informar.

## Fase 1.5 (anotado, não fazer agora)
9. Alerta no WhatsApp **+55 47 99149-8006** quando o lucro das últimas horas cair abaixo de um limite, e meta mensal com barra de progresso. O endpoint `/api/resumo` já devolve a linha pronta para mandar.

## Observações do ambiente desta noite
- O container onde desenvolvi bloqueia saída para Banco Central (PTAX), Meta e OpenAI; as chamadas reais só puderam ser escritas, não executadas. Primeira coleta real acontece na Vercel.
- Senhas iniciais do banco local de desenvolvimento: só existem no `.env.local` deste container (não commitado). Em produção, as senhas vêm de `SEED_SENHA_ERICK` / `SEED_SENHA_IAN` e podem ser trocadas na tela Parâmetros.
