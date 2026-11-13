# Mudança de banco (Supabase antigo → projeto novo), passo a passo

Para quem vai fazer: Erick. Tempo: 30 a 45 min. Eu (Claude) não vejo nenhum segredo em nenhum passo.
O site na Vercel continua o mesmo; só o banco muda. O webhook da Zenith e as chaves da Meta/OpenAI/kie não mudam.

## Passo 1 — Criar o projeto novo (5 min)
1. Entre na conta nova do Supabase → **New project**. Nome: `painel-lucro`. Região: **South America (São Paulo)**. Anote a senha do banco num lugar seguro (nunca aqui).
2. Espere o projeto ficar "Active".

## Passo 2 — Criar as tabelas (2 min)
1. Projeto novo → **SQL Editor** → New query.
2. Abra no GitHub o arquivo `supabase/novo-banco/01_tabelas.sql`, copie TUDO, cole e clique **Run**. Deve terminar sem erro ("Success").

## Passo 3 — Exportar os dados do projeto antigo (10 min)
O projeto antigo está bloqueado para o app, mas o site do Supabase ainda abre.
1. Projeto antigo → **Table Editor** → clique na tabela → botão **Export** (ou "…" → *Export as CSV*). Salve o arquivo com o nome da tabela.
2. Exporte nesta ordem (a ordem importa na importação): `usuarios`, `parametros`, `frentes`, `categorias`, `campanhas`, `vendas`, `lancamentos`, `lancamentos_manuais`, `cambio`, `coletas`, `avisos`, `zenith_eventos`, `alertas`, `visoes_salvas`.
3. Pode pular `tentativas_login` (é só proteção contra senha errada). Se `zenith_eventos` ou `lancamentos` for grande demais para exportar/importar, pule `zenith_eventos` (é só auditoria) e me avise sobre `lancamentos`: a Meta eu recupero pela rota de recuperação.

## Passo 4 — Importar no projeto novo (10 min)
1. Projeto novo → **Table Editor** → clique na tabela → **Insert** → **Import data from CSV** → escolha o arquivo da MESMA tabela → Import.
2. Mesma ordem do passo 3. Se uma importação der erro de "chave estrangeira", é porque uma tabela anterior da lista ainda não foi importada.

## Passo 5 — Ajustar os contadores (1 min)
Projeto novo → SQL Editor → cole `supabase/novo-banco/03_depois_de_importar.sql` → Run. A resposta lista cada tabela com a quantidade de linhas; confira com o antigo (`lancamentos` e `vendas` são as que importam).

## Passo 6 — Agendador de 10 em 10 min (3 min)
1. Projeto **antigo** → SQL Editor → rode `select name, decrypted_secret from vault.decrypted_secrets where name in ('painel_url','painel_cron_secret');` e deixe a aba aberta (são a URL do site e o segredo do agendador; não cole aqui).
2. Projeto **novo** → SQL Editor → cole `supabase/novo-banco/02_agendador.sql`, troque `<SEU-APP>` e `<MESMO VALOR DE CRON_SECRET DA VERCEL>` pelos dois valores da aba do passo anterior → Run.
3. Confira: `select * from cron.job;` deve listar `painel-coleta-10min`.

## Passo 7 — Apontar o site para o banco novo (3 min)
1. Projeto novo → botão **Connect** (topo) → aba **Transaction pooler** (porta 6543) → copie a URI e troque `[YOUR-PASSWORD]` pela senha do passo 1.
2. Vercel → projeto → **Settings → Environment Variables** → `DATABASE_URL` → Edit → cole a URI nova → Save (em Production).
3. Vercel → **Deployments** → no último deploy, "…" → **Redeploy**.

## Passo 8 — Conferir (2 min)
1. `https://SEU-SITE/api/saude` deve responder ok.
2. Entrar no painel (mesmos usuários e senhas: vieram na tabela `usuarios`), abrir a inicial e clicar **Atualizar agora**. Em /avisos não deve haver faixa de migração pendente (o app aplica sozinho o que faltar).
3. Em até 10 min a coleta automática roda; o selo "agendador" na inicial mostra "há N min".
4. Depois disso, o projeto antigo pode ser apagado (ou deixado parado; ele renova em 03/12).

## Se algo der errado
- "Dado indisponível" após o redeploy: confira a `DATABASE_URL` (porta 6543, senha certa). `/api/diagnostico` mostra o erro de conexão.
- Importação de CSV reclamando de coluna: o CSV foi exportado de outra tabela, ou o arquivo foi editado. Exporte de novo sem mexer.
