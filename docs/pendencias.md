# Pendências (dependem do Erick)

Atualizado em 04/10/2026. Nada aqui bloqueia o que já está pronto; cada item destrava uma fonte real.

## Urgente
0. **Trocar a senha do banco** (foi colada por engano no chat em 04/10). Supabase → Settings → Database → "Reset database password" → Generate → Update. Depois, na Vercel → Settings → Environment Variables → edite `DATABASE_URL` com a nova senha → Deployments → Redeploy. Depois rode de novo `supabase/agendador.sql`? Não precisa: o agendador chama a URL do site, não o banco.

## Bloqueiam fontes reais
1. **Zenith — webhook pronto (contrato oficial implementado em 04/10).** Falta você: (a) rodar `drizzle/0001_zenith_eventos.sql` no Supabase; (b) cadastrar o endpoint na Zenith com os 6 eventos; (c) colar o segredo em `ZENITH_WEBHOOK_SECRET` na Vercel e dar Redeploy. Passo a passo em `docs/como-publicar.md`, Parte 4. Dúvidas que só o payload real responde: se vem `referenceId` em todos os eventos (dedup depende dele), se vem produto/descrição (para "Vendas por produto") e o campo de data (usei createdAt/capturedAt/creditedAt/paidAt, senão o timestamp do header). Eventos com formato diferente ficam guardados em `zenith_eventos` e abrem aviso "formato desconhecido".
2. **Meta — token de usuário de sistema** com escopo `ads_read` (longa duração), colar em `META_TOKEN` na Vercel. Depois eu testo se as contas 00 e 01 entregam hora (síncrono ou assíncrono) ou só dia.
3. **OpenAI — chave de administrador** (`sk-admin-…`, somente leitura de uso/custos) em `OPENAI_ADMIN_KEY`, e o id do projeto "Cenas Ligeras" em `OPENAI_PROJECT_ID`.
4. **kie.ai — histórico que a API não entrega.** A API só expõe o saldo; o app mede o uso pela queda de saldo entre leituras (a cada 10 min) e infere recargas por pacotes de 1.000 créditos. O que aconteceu ANTES da primeira leitura (23:30 de 04/10) não é recuperável pela API. Lance manualmente em **Lançamentos manuais** (tipo saída, moeda **USD**, categoria **IA**, frequência única, "começa em" = meio-dia do dia):
   - 03/10/2026 12:00 → 17,28 (kie.ai 03/10, do painel kie.ai/usage)
   - 04/10/2026 12:00 → o valor que o painel kie.ai/usage mostrar para 04/10 amanhã (as 3 recargas de 1.000 somem até saldo 0, então deve ser ≥ US$ 15)
   01/10 e 02/10 são anteriores ao marco zero (só se quiser histórico). A partir de 05/10 a coleta cobre sozinha.

## Backfill da Zenith (vendas de 03/10 em diante que o webhook não pegou)
- **Caminho:** Zenith → Vendas → Conciliação em CSV → Baixar CSV → tela **Importar CSV** do app (sem editar o arquivo). Não duplica, nem com o webhook depois (mesmo `id_venda`; a `referencia` fica como id alternativo).
- A API pública da Zenith não tem listagem (só GET /integrations/checkouts/:id etc.), então a rota de backfill por API foi removida.
- Fim de semana/feriado usa a última PTAX até a data. Se a importação disser "sem câmbio", é porque não há NENHUMA taxa MXN gravada: clique "Atualizar agora" no painel (coleta de câmbio) e importe de novo.

## Agendador: como conferir que roda a cada 10 min
- No painel, o selo **"agendador: há N min"** usa a coleta de câmbio como batimento (ela roda sempre). Mais de 15 min = parado.
- No Supabase → SQL Editor: `select start_time, status, return_message from cron.job_run_details order by start_time desc limit 10;` Se `status = failed`, cole o `return_message` para mim. Fontes sem chave (Meta/OpenAI/kie) agora mostram "sem chave (tentou HH:MM)" em vez de uma hora antiga.

## Após o deploy de 05/10 (desempenho e correções)
- Índices 0002: feitos em 05/10. Parâmetros novos: criados sozinhos pela coleta de 10 em 10 min (`garantirBasico`), sem abrir `/api/seed`.
- Aba do navegador em segundo plano: o Chrome pausa animações, temporizadores e parte do JavaScript em abas ocultas; a página pode chegar e só "aparecer"/responder quando a aba volta à frente. Removi a animação de entrada (era o que deixava o conteúdo invisível). Se os botões ainda não responderem em aba oculta, é limitação do navegador: traga a aba para a frente antes de clicar.
- Produto nas vendas: o CSV de Conciliação da Zenith NÃO traz produto. O webhook preenche se o payload tiver `productName`, `product.name/title`, `checkout.name/title`, `items[0].name`, `metadata.product`/`plan`, `infoproduct`, `description`. Se /produtos continuar vazio, abra uma linha de `zenith_eventos` e me diga quais campos o `data` tem.
- Conta Meta 01 (act_210256430938513): a tela Campanhas agora mostra, por conta, quantas linhas a última coleta trouxe. "0 linhas" sem erro = a Meta não devolveu gasto (campanhas pausadas/sem veiculação); com erro = problema de acesso.

## Alertas no WhatsApp — ativação (só o Erick, com o celular na mão)
O app usa o CallMeBot (grátis, sem conta). Leva 3 minutos:
1. No celular, **salve o contato** +34 644 71 81 99 (nome: CallMeBot).
2. Abra o WhatsApp e **mande para esse contato exatamente**: `I allow callmebot to send me messages`
3. Em até 2 minutos o CallMeBot responde com uma mensagem contendo **"your apikey is 123456"** (um número). Anote esse número.
4. Na Vercel → projeto `painel-lucro` → Settings → Environment Variables → **Add**:
   - `WHATSAPP_ALERTA_FONE` = `5547991498006` (seu número com DDI 55 e DDD, só dígitos)
   - `CALLMEBOT_APIKEY` = o número do passo 3
   → Save → Deployments → **Redeploy** (último deploy, "Redeploy").
5. No Supabase → SQL Editor → cole e rode `drizzle/0003_alertas.sql` (raw: https://raw.githubusercontent.com/pr4g4/painel-lucro/main/drizzle/0003_alertas.sql).
6. Teste: logado no app, abra `https://painel-lucro.vercel.app/api/alertas/teste`. Deve chegar "✅ Painel de Lucro: teste de alerta…" no seu WhatsApp. Se a resposta disser `não configurado`, falta uma variável; se disser erro do CallMeBot, confira a apikey.
O que dispara (1 mensagem por tipo a cada `alerta_repeticao_h` = 3 h, e um "✅ Resolvido" quando normaliza): saldo kie.ai/OpenAI abaixo de `alerta_saldo_horas` (6 h) ou de `alerta_saldo_usd` (US$ 3); fonte com 3 coletas seguidas falhando (Meta, Zenith, OpenAI, kie, câmbio); webhook da Zenith rejeitado; agendador parado há mais de 30 min (detectado quando alguém abre o app, já que parado ele não roda nada).
Alternativa pela API do ZapData: `WHATSAPP_PROVEDOR=zapdata`, `ZAPDATA_ALERTA_URL` (endpoint que aceita POST JSON `{ phone, message }`) e, se precisar, `ZAPDATA_ALERTA_TOKEN`. Me passe a URL da doc do ZapData se quiser esse caminho.

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

## Visual novo (fase 3, 05/10 de madrugada) — o que mudou e o que conferir
- Painel: um destaque só (Lucro líquido do período, com comparação e minilinha), fileira de 4 números (Receita líquida, Meta c/ imposto, IA, Nº de vendas) e o resto em seções recolhíveis (Indicadores, Custos detalhados, Vendas e pendentes, Por número de WhatsApp, Gráficos, Projeção e ponto de equilíbrio, Créditos das IAs, Fontes e atualização). As seções lembram se ficaram abertas ou fechadas neste navegador.
- Seletor de período: só as fichas de período; fuso, moeda, gráfico por hora/dia, histórico, manuais, copiar link e salvar visão ficaram no botão **Opções ▾** (à direita da linha do período).
- DRE: cabeçalho da tabela fica fixo ao rolar; a coluna "vs. anterior" some quando não há base de comparação.
- Prints de referência em `docs/prints/` (painel, DRE e campanhas; computador e celular; claro e escuro).
- Nenhum cálculo mudou: o lucro do painel continua igual ao da DRE ao centavo (teste automático confere).
- Conferir no iPhone real: abrir/fechar seções, botão Opções e a barra "Hoje" fixa sob o cabeçalho.
