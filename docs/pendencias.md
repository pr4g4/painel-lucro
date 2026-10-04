# Pendências (dependem do Erick)

Atualizado em 04/10/2026. Nada aqui bloqueia o que já está pronto; cada item destrava uma fonte real.

## Urgente
0. **Trocar a senha do banco** (foi colada por engano no chat em 04/10). Supabase → Settings → Database → "Reset database password" → Generate → Update. Depois, na Vercel → Settings → Environment Variables → edite `DATABASE_URL` com a nova senha → Deployments → Redeploy. Depois rode de novo `supabase/agendador.sql`? Não precisa: o agendador chama a URL do site, não o banco.

## Bloqueiam fontes reais
1. **Zenith — webhook pronto (contrato oficial implementado em 04/10).** Falta você: (a) rodar `drizzle/0001_zenith_eventos.sql` no Supabase; (b) cadastrar o endpoint na Zenith com os 6 eventos; (c) colar o segredo em `ZENITH_WEBHOOK_SECRET` na Vercel e dar Redeploy. Passo a passo em `docs/como-publicar.md`, Parte 4. Dúvidas que só o payload real responde: se vem `referenceId` em todos os eventos (dedup depende dele), se vem produto/descrição (para "Vendas por produto") e o campo de data (usei createdAt/capturedAt/creditedAt/paidAt, senão o timestamp do header). Eventos com formato diferente ficam guardados em `zenith_eventos` e abrem aviso "formato desconhecido".
2. **Meta — token de usuário de sistema** com escopo `ads_read` (longa duração), colar em `META_TOKEN` na Vercel. Depois eu testo se as contas 00 e 01 entregam hora (síncrono ou assíncrono) ou só dia.
3. **OpenAI — chave de administrador** (`sk-admin-…`, somente leitura de uso/custos) em `OPENAI_ADMIN_KEY`, e o id do projeto "Cenas Ligeras" em `OPENAI_PROJECT_ID`.
4. **kie.ai — API key Default do Ian** em `KIE_API_KEY` **e o preço por crédito em US$** (parâmetro `kie_usd_por_credito` na tela Parâmetros; o exemplo usa 0,005 e está marcado como EXEMPLO). Verificar também se o painel do kie.ai tem log por requisição (daria uso por hora de verdade; hoje é por diferença de saldo).

## Backfill da Zenith (vendas de 03/10 em diante que o webhook não pegou)
- **Caminho:** Zenith → Vendas → Conciliação em CSV → Baixar CSV → tela **Importar CSV** do app (sem editar o arquivo). Não duplica, nem com o webhook depois (mesmo `id_venda`; a `referencia` fica como id alternativo).
- A API pública da Zenith não tem listagem (só GET /integrations/checkouts/:id etc.), então a rota de backfill por API foi removida.
- Fim de semana/feriado usa a última PTAX até a data. Se a importação disser "sem câmbio", é porque não há NENHUMA taxa MXN gravada: clique "Atualizar agora" no painel (coleta de câmbio) e importe de novo.

## Agendador: como conferir que roda a cada 10 min
- No painel, o selo **"agendador: há N min"** usa a coleta de câmbio como batimento (ela roda sempre). Mais de 15 min = parado.
- No Supabase → SQL Editor: `select start_time, status, return_message from cron.job_run_details order by start_time desc limit 10;` Se `status = failed`, cole o `return_message` para mim. Fontes sem chave (Meta/OpenAI/kie) agora mostram "sem chave (tentou HH:MM)" em vez de uma hora antiga.

## Decisões a confirmar
5. **Teste de sanidade do ZapData (R$ 126,68).** Pela fórmula 4 (ciclo dia 2 → dia 1), 12/09–02/10 dá R$ 83,17. O valor 126,68 = 33 dias × R$ 119 ÷ 31, ou seja, uma janela de 33 dias (ex.: 31/08–02/10). Divergência maior que R$ 1,00; implementei a fórmula 4 como escrita. Confirmar qual janela foi usada ou aceitar 83,17 como o número correto para 12/09–02/10.
6. **Reembolso de venda histórica (anterior ao marco zero).** Hoje fica fora da receita (começamos do zero). Se quiser que apareça como linha negativa mesmo assim, é um ajuste de 1 linha.
7. **Imposto Meta: 1 ÷ 0,8785 ou × 1,1383?** Uso o exato (1 ÷ (1 − 12,15%)); diferença de 1 centavo em R$ 315,29 (358,90 vs 358,89). Teste de sanidade passa nos dois.
8. **Vencimento das taxas (reserva, etc.)**: a reserva retida usa o valor que a Zenith informar por venda; o parâmetro `reserva_zenith_pct` (10%) só vale quando a fonte não informar.

## Fase 1.5 (anotado, não fazer agora)
9. Alerta no WhatsApp **+55 47 99149-8006** quando o lucro das últimas horas cair abaixo de um limite, e meta mensal com barra de progresso. O endpoint `/api/resumo` já devolve a linha pronta para mandar.

## Verificar no iPhone (não tenho Safari aqui)
- Menu hambúrguer, atalhos de período, botão "Opções" do seletor e tema: testados em Chromium emulando iPhone 13 (toque), não em Safari real. Se algum botão ainda não responder no iPhone, me diga qual e em qual tela.

## Observações do ambiente desta noite
- O container onde desenvolvi bloqueia saída para Banco Central (PTAX), Meta e OpenAI; as chamadas reais só puderam ser escritas, não executadas. Primeira coleta real acontece na Vercel.
- Senhas iniciais do banco local de desenvolvimento: só existem no `.env.local` deste container (não commitado). Em produção, as senhas vêm de `SEED_SENHA_ERICK` / `SEED_SENHA_IAN` e podem ser trocadas na tela Parâmetros.
