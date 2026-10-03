# Passo 1 — Viabilidade das fontes e arquitetura

Data: 03/10/2026. Marco zero: 03/10/2026 00:00 (America/Sao_Paulo).
Decisões já tomadas pelo Erick (seção 12 do prompt): (1) Zenith só vendas e reserva, saque fora; (2) imposto 8% sobre lucro bruto do período filtrado; (3) reembolso/chargeback na data do reembolso; (4) alerta WhatsApp para +55 47 99149-8006 fica na fase 1.5 (anotado em pendências).

## 1. Quadro fonte → método → granularidade → atraso → risco

| Fonte | Método de coleta (prioridade) | Granularidade real | Atraso típico | Risco principal | Mitigação |
|---|---|---|---|---|---|
| **Meta Ads conta 00** `act_240727500555671` | API oficial Marketing API `/{act}/insights`, nível `campaign`, breakdown `hourly_stats_aggregated_by_advertiser_time_zone`, campos `spend`, `campaign_name`, `campaign_id`, `effective_status`. Token de **usuário de sistema** com escopo `ads_read`, longa duração. | **Hora** se a conta tiver o breakdown horário liberado; senão **dia**. | 15–60 min (dado de gasto da Meta é retroativamente ajustado em até ~48 h). | **Desde 06/08/2026 o breakdown horário vem vazio para a maioria das contas** (sucesso HTTP com lista vazia, sem erro). Saídas: administrador ativa no Gerenciador de Anúncios, ou usar **relatório assíncrono** (`/{act}/insights` POST → `report_run_id` → polling). Histórico horário limitado a 13 meses. | Teste no passo 3: síncrono por hora → se vazio, assíncrono → se vazio, cai para diário com selo "diário". Recoleta das últimas 48 h a cada ciclo para absorver ajustes. |
| **Meta Ads conta 01** `act_210256430938513` | Idem. | Idem. | Idem. | Idem; cada conta pode ter opt-in diferente. | Testar as duas separadamente; selo por conta. |
| **Zenith** (vendas) | **Não encontrei API pública nem documentação de webhook** da Zenith Pay brasileira (zenithpay.com.br). Ordem a verificar **com o Erick dentro do painel**: (1) menu Integrações/Webhook/Postback por venda → **webhook** para o nosso servidor; (2) exportação CSV → importador manual/agendado; (3) **coletor por extensão do Chrome** lendo a aba logada (último recurso). | **Minuto** (data/hora de aprovação) em qualquer um dos três métodos. | Webhook: segundos. CSV: quando alguém exportar. Extensão: só com o navegador aberto. | É a **fonte mais crítica e a menos garantida**. Sem webhook, "tempo real" da receita depende de alguém. Também precisa confirmar se a Zenith expõe: líquido, reserva, status pendente/reembolsada, produto, "BRL estimado". | **Bloqueio do passo 4** até o Erick abrir Configurações/Integrações da Zenith e me dizer o que existe. Enquanto isso o app aceita **Venda manual** (tela 7). |
| **ZapData** | Nenhuma API pública localizada. Fase 1: **lançamento manual recorrente** mensal (R$ 119, dia 2, início 02/10/2026, sem fim), diluído por dia e por hora. Conversas ficam fora. | Mês → diluído por hora pela fórmula 4. | Zero (é regra, não coleta). | Nenhum para custo. Conversas só se houver API (não é requisito da fase 1). | Já atendido pela tela de Lançamentos manuais. |
| **kie.ai** (conta do Ian, API key Default) | API oficial só expõe **saldo** (`GET /api/v1/chat/credit`). Uso = **diferença de saldo entre coletas** × preço por crédito, descartando recargas (saldo que sobe). Alternativa: log por requisição no painel (verificar no passo 5). | **Intervalo de coleta** (5–15 min) por diferença; dia pelo painel. | Minutos. | Diferença de saldo não distingue modelo nem requisição; recarga no meio de um ciclo precisa ser detectada (saldo sobe → ignorar e marcar aviso). Preço por crédito em USD precisa ser confirmado na conta. | Guardar cada leitura de saldo em `lancamentos` (fonte `kie_saldo`) e derivar uso; reconciliar com o painel diário (teste de sanidade: US$ 16,65 em 02/10). |
| **OpenAI** (projeto "Cenas Ligeras") | API oficial Admin: `GET /v1/organization/usage/completions` (`bucket_width` = `1m`/`1h`/`1d`, `group_by` = `project_id`,`model`) e `GET /v1/organization/costs` (**só `1d`**, em USD). Exige **chave de administrador** (`sk-admin-…`), somente leitura. | **Hora** no uso (tokens); **dia** no custo. | ~5–60 min no uso; custo diário fecha em UTC. | Custo horário é **derivado** (tokens × preço do modelo), não medido; buckets em UTC. | Ratear o custo diário pelo peso dos tokens por hora e reconciliar com `/costs` (sanidade: US$ 7,30 em 02/10). Selo "estimado por hora, fechado no dia". |
| **Câmbio USD→BRL** | API oficial PTAX (Banco Central, Olinda OData): `CotacaoDolarDia`. | **Dia** (boletim de fechamento). | Publicado ~13h15 BRT; fim de semana/feriado usa último dia útil. | Nenhum relevante. Taxa do dia corrente só sai à tarde → até lá usar a do dia útil anterior e marcar "provisória", recalculando o dia ao fechar. | Tabela `cambio` com uma linha por dia; nunca reescrever dia antigo. |
| **Câmbio MXN→BRL** | Campo "BRL estimado" da própria Zenith por venda; fallback PTAX `CotacaoMoedaDia(moeda='MXN')`. | Por venda; dia no fallback. | Igual à venda. | Depende do que a Zenith expõe (ver linha Zenith). | Taxa usada gravada em cada venda. |
| **Lançamentos manuais / Venda manual** | Tela do app, gravação direta no banco. | **Minuto**. | Zero. | Erro de digitação. | Origem `manual` sempre visível; edição só do Erick. |

Observação deste ambiente: o container onde estou agora bloqueia saída para `developers.facebook.com`, `platform.openai.com` e `olinda.bcb.gov.br`. Isso **não afeta o servidor publicado**; afeta só testes feitos daqui. Testes reais das APIs serão feitos no host de produção ou pelo Erick com um comando que eu entrego.

## 2. Arquitetura

**Escolha: Next.js 15 (App Router) + Postgres no Supabase (plano Free) + Vercel (plano Hobby, grátis) + agendador pg_cron/pg_net do Supabase.** Custo: R$ 0.
Justificativa em 3 linhas:
1. Um só repositório e um só deploy cobrem front, API, login e coletores; o Erick só cola variáveis no painel da Vercel (sem servidor para administrar).
2. Postgres dá as chaves únicas de idempotência e as consultas por minuto que o seletor exige; o Supabase Free já traz Postgres, pg_cron e pg_net.
3. O agendador fica dentro do banco (pg_cron chama a rota da Vercel a cada 10 min via pg_net): roda com ou sem alguém logado e não depende de minutos de CI nem de plano pago.

### Agendador: por que pg_cron + pg_net (e não as outras opções grátis)
| Opção | Grátis? | Problema |
|---|---|---|
| Vercel Cron (Hobby) | sim | só permite **1 execução por dia** por job; 10 min exige plano Pro (US$ 20/mês). |
| GitHub Actions (repo privado) | 2.000 min/mês | 6 execuções/h × 24 × 30 = 4.320 execuções; mesmo a ~0,5 min cada são ~2.160 min/mês, acima do limite, e o cron do GitHub atrasa/pula em horário de pico. |
| Cloudflare Cron Triggers (Workers Free) | sim | precisa de mais uma conta e um Worker só para chamar a rota; funciona, mas é peça a mais para um leigo manter. |
| **Supabase pg_cron + pg_net (Free)** | **sim** | nenhuma conta extra; o SQL está em `supabase/agendador.sql`. Risco: projeto Free **pausa após 7 dias sem atividade**; as chamadas de 10 min da própria coleta contam como atividade, então na prática não pausa. Se pausar, basta clicar "Restore" no painel do Supabase. |

Limites do plano Hobby da Vercel que o código já respeita: função serverless até 60 s (`maxDuration = 60`, cada fonte roda em chamada própria se precisar), 100 GB de banda/mês (o app é leve).

Componentes:
- `app/` Next.js 15, TypeScript, Tailwind, shadcn/ui, Recharts.
- `app/api/coleta/[fonte]` rotas POST protegidas por `CRON_SECRET`; cada coletor é idempotente (upsert por chave natural).
- `app/api/zenith/webhook` endpoint receptor, com segredo em cabeçalho, se a Zenith tiver webhook.
- Login próprio: usuários em tabela `usuarios`, senha com **argon2id**, sessão em cookie `httpOnly; Secure; SameSite=Lax`, limite de 5 tentativas / 15 min por IP+usuário. Sem Supabase Auth para manter dois usuários e papéis simples (`edita` / `ve`).
- Cálculo em uma única função pura `calcularDRE(periodo, opcoes)` usada **tanto pelos cartões quanto pela DRE**, garantindo que batam centavo a centavo. Período anterior = mesma função com janela deslocada.
- Toda data gravada em UTC (`timestamptz`); conversão para Brasília/México só na exibição e no agrupamento por hora/dia.

Tabelas mínimas (detalhadas no passo 2): `usuarios`, `parametros` (chave, valor, vigencia_inicio, vigencia_fim), `frentes` (nome, regra de nome de campanha, ativa), `campanhas`, `lancamentos` (fonte, chave_natural única, instante, valor_original, moeda, valor_brl, taxa_cambio, historico, payload bruto), `vendas` (fonte, id_origem único, aprovada_em, bruto_mxn, taxas, liquido, reserva, status, produto, reembolsada, reembolsada_em), `lancamentos_manuais` (tipo saída/entrada, moeda, valor, categoria, frequência, inicio, fim, status), `categorias`, `cambio` (dia, par, taxa, fonte), `avisos`, `coletas` (fonte, iniciada_em, terminada_em, ok, erro) para o carimbo "atualizado às".

Variáveis de ambiente (nomes apenas): `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `META_TOKEN`, `META_ACT_00`, `META_ACT_01`, `OPENAI_ADMIN_KEY`, `OPENAI_PROJECT_ID`, `KIE_API_KEY`, `ZENITH_WEBHOOK_SECRET` (se houver), `APP_TZ=America/Sao_Paulo`, `SEED_SENHA_ERICK`, `SEED_SENHA_IAN` (só para o primeiro seed). Passo a passo de criação das contas e de onde colar cada uma: `docs/como-publicar.md`.

## 2.1 O que já está construído (noite de 03/10)
- Banco (13 tabelas, migração em `drizzle/`), parâmetros com vigência, login argon2id + sessão httpOnly + limite de tentativas, papéis edita/vê.
- Motor de cálculo puro (`src/lib/calculo`) usado pelos cartões e pela DRE; 28 testes automáticos incluindo os números de sanidade de 02/10 e a idempotência dos coletores.
- Coletores de Meta (hora → assíncrono → dia), OpenAI (uso por hora + custo diário), kie.ai (por diferença de saldo), câmbio PTAX, Zenith (webhook + CSV + normalizador), com clientes simulados para desenvolver sem chave.
- Telas: login, painel, DRE (total, intervalos, expansível, CSV), campanhas, lançamentos manuais, venda manual, custos por tipo, lançamentos, por produto, avisos, parâmetros/frentes/usuários; tema claro/escuro; celular.
- Comando "atualizar painel" em 1 linha: `GET /api/resumo` (também o botão "Atualizar agora").

## 3. Pendências (fora do passo atual)
- Fase 1.5: alerta WhatsApp para +55 47 99149-8006 quando o lucro das últimas horas cair abaixo de um limite; meta mensal com barra de progresso.
- Confirmar preço por crédito do kie.ai e se o painel tem log por requisição.
- Confirmar plano da Vercel (gratuito limita cron a 1×/dia → usar GitHub Actions como agendador).

## 4. Decisão aberta que bloqueia o passo 4 (Zenith)
Erick precisa abrir o painel da Zenith em Configurações / Integrações / Webhooks (ou Postback) e me dizer:
(a) existe webhook por venda? (b) existe exportação CSV/Excel das vendas com data e hora? (c) a lista de vendas mostra líquido, reserva, status pendente, produto e "BRL estimado"?
Passos 2 e 3 não dependem disso e podem seguir.
