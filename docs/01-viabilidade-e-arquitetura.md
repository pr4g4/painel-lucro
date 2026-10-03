# Passo 1 — Viabilidade das fontes e arquitetura

Data: 03/10/2026. Marco zero: 03/10/2026 00:00 (America/Sao_Paulo).
Status: **aguardando aprovação do Erick** antes de codar.

## Decisões já tomadas (seção 12 do prompt)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Saques/liberações da Zenith | App lê **só vendas e reserva**. Saque fica fora da fase 1. |
| 2 | Base do imposto de 8% | **(a) lucro bruto do período filtrado**. Opções (b) e (c) existem como parâmetro, desligadas. |
| 3 | Reembolso/chargeback | Linha negativa **na data/hora do reembolso**; venda original marcada `reembolsada = true`. |
| 4 | Alerta de queda de lucro | **Sim, por WhatsApp** (fase 1.5). Número do destino vai em variável de ambiente `ALERTA_WHATSAPP_DESTINO`, nunca no código. |

## Quadro de viabilidade: fonte → método → granularidade → atraso → risco

| Fonte | Método de coleta | Granularidade real | Atraso típico | Risco e mitigação |
|---|---|---|---|---|
| **Meta Ads 00 e 01** | **API oficial** Graph `act_<id>/insights` com `breakdowns=hourly_stats_aggregated_by_advertiser_time_zone`, nível campanha, `time_increment=1`, `date_preset`/`time_range` por dia; token de **usuário de sistema** com escopo `ads_read`. Fallback: **relatório assíncrono** (`/insights` POST → `report_run_id` → GET) se a quebra horária estiver bloqueada na conta. | **Hora** (fuso da conta de anúncios). Se a quebra horária estiver indisponível: **dia**, com selo "diário". | 15 min a 1 h (Meta consolida gasto com atraso; valor do dia corrente muda até o fechamento). | **Alto**: desde **06/08/2026** a quebra horária exige **opt-in da conta**; sem opt-in a API devolve vazio em silêncio. Mitigação: testar nas 2 contas no passo 3; se vazio, Erick ativa no Gerenciador ou caímos para relatório assíncrono; se nem assim, granularidade dia. Histórico horário limitado a **13 meses** (irrelevante para nós). Paginar campanhas (50+). Recoletar as **últimas 72 h** a cada ciclo para absorver ajustes retroativos (idempotente). |
| **Zenith** | **Não achei API nem documentação pública** (buscas devolvem só homônimos: crypto Stellar, Austrália, Índia, app "Zenith Pay" BR sem docs). Ordem de preferência: (1) webhook/API de produtor se existir no painel; (2) **exportação CSV** do painel importada pelo app; (3) **coletor por extensão do Chrome** lendo a aba logada (nunca guarda senha). | **Minuto** (data/hora da aprovação) nas opções 1 e 3; na opção 2 depende do CSV. | Opção 1: segundos. Opção 3: 5–15 min. Opção 2: manual (horas). | **Alto**: fonte principal de receita sem API confirmada. **Depende do Erick** (pergunta 1 abaixo). Produto por venda, reserva, pendentes e reembolsos só se o painel/CSV trouxer; senão "dado indisponível". |
| **ZapData** | **Nenhuma API pública encontrada.** Mensalidade entra como **lançamento recorrente mensal** (R$ 119, começa 02/10/2026, dia 2, sem fim) na tela de lançamentos manuais. Contagem de conversas fica **fora** da fase 1. | Mês → diluído por dia e por hora (fórmula 4). | Nenhum (regra interna). | **Baixo**. Reajuste de preço = novo parâmetro com vigência. |
| **kie.ai** (conta do Ian) | **API oficial parcial**: existe `GET /api/v1/chat/credit` (saldo de créditos) e detalhe por tarefa. **Não achei endpoint de histórico de consumo.** Plano: poll do saldo a cada 5–15 min e registrar o **delta** como uso; converter créditos → USD pela tabela de preço da kie.ai (parâmetro com vigência). Reconciliar com o log de uso do painel (verificar se é por requisição). | Uso em **USD por ciclo de coleta (5–15 min)** via delta de saldo; **recarga** detectada como delta positivo e **ignorada** (regra: conta pelo uso). | 5–15 min. | **Médio**: documentação bloqueada neste ambiente (ver "Rede"); confirmar no passo 5 a relação crédito→USD e se a chave Default do Ian tem permissão. Primeira leitura não gera uso (precisa de 2 pontos). |
| **OpenAI** (projeto Cenas Ligeras) | **API oficial** de administração: `GET /v1/organization/usage/completions` (`bucket_width=1h`, `group_by=project_id,model`) e `GET /v1/organization/costs` (`bucket_width=1d`, só diário). Exige chave **admin** (`sk-admin-…`), somente leitura. | **Hora** para tokens; **dia** para custo em USD. Custo por hora = tokens/hora × preço do modelo (parâmetro), reconciliado com o custo diário. | Uso: minutos. Custo diário: pode fechar com horas de atraso. | **Baixo**. Buckets em **UTC** → converter para Brasília. Chave admin dá acesso à org inteira: filtrar por `project_id`. |
| **Câmbio USD→BRL e MXN→BRL** | **API pública PTAX/Banco Central** (Olinda, OData, sem chave): `CotacaoDolarDia` e `CotacaoMoedaDia(moeda='MXN')`. Usar **PTAX de fechamento (venda)**. MXN→BRL da venda vem do campo "BRL estimado" da Zenith; PTAX MXN é só fallback. | **Dia** (dia útil). Fim de semana/feriado = último dia útil. | Boletim de fechamento sai ~13h; antes disso usar o dia anterior e marcar `provisorio = true`, substituir quando sair. | **Baixo**. Taxa guardada por dia; dia antigo nunca recalculado. |
| **Lançamentos manuais e venda manual** | Tela do app → banco próprio. | **Minuto**. | Imediato. | Nenhum. |

Legenda de granularidade: "hora" = o app grava por hora e o seletor com minuto corta por hora cheia dessa fonte, mostrando o selo "horário". "Dia" = aparece no dia com selo "diário"; **nunca** espalhado por horas.

## Teste de sanidade (seção 11) — como cada fonte vai provar que funciona

- Meta 02/10: soma das duas contas = R$ 315,29 → ×1,1383 = R$ 358,89.
- kie.ai 02/10: US$ 16,65 (depende do log do painel para a 1ª conferência; a partir daí, delta de saldo).
- OpenAI 02/10 (UTC): US$ 7,30 via `/organization/costs`.
- Histórico 12/09–02/10: Meta c/ imposto R$ 3.550,55; Zenith 45 vendas = R$ 1.545,30; ZapData diluído R$ 126,68.
- Tolerância R$ 1,00; acima disso paro e mostro.

## Arquitetura

**Escolha: Next.js 15 (App Router, TypeScript) + Postgres (Drizzle ORM) + um processo *worker* de coletores, tudo num só repositório, hospedado no Railway (ou Render).**
Justificativa em 3 linhas:
1. Os coletores precisam rodar **no servidor, 24 h, sem ninguém logado**: um worker Node com `node-cron` no mesmo deploy resolve isso sem depender de cron da Vercel (que no plano gratuito só roda 1× ao dia) nem de Edge Functions.
2. Postgres puro dá **idempotência por chave única**, janelas de tempo com fuso e somas exatas em `numeric`; Drizzle mantém o esquema versionado no repositório.
3. Next.js entrega painel, API e login num só lugar; Tailwind + shadcn/ui + Recharts para telas e gráfico; Vercel fica como alternativa se o Erick preferir (aí o worker iria para o Railway sozinho).

### Componentes
- `web/` (Next.js): login, painel, DRE, tabelas, lançamentos manuais, venda manual, avisos. Cache desligado nas rotas de dados (`dynamic = 'force-dynamic'`).
- `worker/`: agendador (`*/10 * * * *`), um coletor por fonte, cada um com `coleta_log` (início, fim, status, erro). 3 falhas seguidas → `avisos`.
- Banco: `usuarios`, `frentes`, `parametros` (valor, vigência início/fim), `cambio`, `campanhas`, `lancamentos` (fato unificado: fonte, tipo, instante, valor original, moeda, valor BRL, taxa usada, id na origem, `historico`), `vendas`, `lancamentos_manuais` (saída/entrada, recorrência), `avisos`, `coleta_log`, `visoes_salvas`.
- Chaves únicas: `(fonte, id_origem)` vendas; `(fonte, conta, campanha_id, instante)` Meta; `(fonte, instante, modelo)` IA; `(moeda, data)` câmbio.
- Motor de cálculo único (`calculo/`) usado por painel, cartões e DRE, para que batam centavo a centavo; parâmetro escolhido pela vigência na data/hora de cada lançamento.
- Segurança: argon2, sessão em cookie httpOnly + SameSite=Lax, limite de 5 tentativas/15 min por IP+usuário, papéis `edita`/`ve`. Segredos só em variáveis de ambiente do host.

### Variáveis de ambiente previstas (só nomes)
`DATABASE_URL`, `SESSION_SECRET`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_IDS`, `OPENAI_ADMIN_KEY`, `OPENAI_PROJECT_ID`, `KIE_API_KEY`, `ZENITH_*` (a definir conforme método), `ALERTA_WHATSAPP_DESTINO` (fase 1.5), `TZ=America/Sao_Paulo`.

## Rede deste ambiente de desenvolvimento (importante)
Neste ambiente de nuvem o acesso de saída está **bloqueado** para `graph.facebook.com`, `api.openai.com`, `api.kie.ai`, `olinda.bcb.gov.br`, `developers.facebook.com` e `docs.kie.ai` (só npm e GitHub liberados). Dá para construir banco, login e telas com dados de teste, mas **os coletores só podem ser testados de verdade** depois que o Erick liberar esses domínios nas configurações de rede do ambiente, ou no próprio host de produção.

## Pendências
- Fase 1.5: meta mensal, alerta WhatsApp de queda de lucro (número já informado).
