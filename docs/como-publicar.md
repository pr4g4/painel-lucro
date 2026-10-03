# Como publicar de graça (passo a passo para leigo)

Tempo: ~40 minutos. Custo: R$ 0. Você vai criar duas contas entrando com o GitHub: **Supabase** (banco) e **Vercel** (site). Nunca cole senha ou chave em chat; só nos lugares indicados.

Antes de começar, tenha à mão: seu login do GitHub (onde está o repositório `pr4g4/painel-lucro`).

---

## Parte 1 — Banco no Supabase (10 min)

1. Abra **https://supabase.com** → **Start your project** → **Continue with GitHub** → autorize.
2. Clique **New project**.
   - Organization: a sua (já vem criada).
   - Name: `painel-lucro`
   - Database Password: clique **Generate a password** e **copie para um lugar seguro** (Notas do celular, por exemplo). Você vai usar daqui a pouco.
   - Region: **South America (São Paulo)**.
   - Plan: **Free**.
   - Clique **Create new project** e espere 1–2 minutos.
3. Pegar a **URL de conexão**:
   - No topo da tela do projeto clique **Connect** (botão perto do nome do projeto).
   - Em **Connection string**, escolha **Transaction pooler** (porta 6543) e **URI**.
   - Copie o texto que começa com `postgresql://postgres.xxxx:[YOUR-PASSWORD]@...`.
   - Troque `[YOUR-PASSWORD]` pela senha gerada no passo 2. Guarde essa linha inteira: ela é a sua **DATABASE_URL**.
4. Criar as tabelas: no menu esquerdo clique **SQL Editor** → **New query** → abra no GitHub o arquivo `drizzle/0000_smiling_darkhawk.sql` do repositório, clique **Raw**, copie TUDO, cole no editor e clique **Run**. Deve aparecer "Success".

## Parte 2 — Site na Vercel (10 min)

5. Abra **https://vercel.com** → **Sign Up** → **Continue with GitHub** → autorize. Plano **Hobby** (grátis).
6. Clique **Add New…** → **Project** → ao lado de `pr4g4/painel-lucro` clique **Import**.
   - Se o repositório não aparecer: **Adjust GitHub App Permissions** → marque o repositório → Save.
7. Antes de clicar Deploy, abra **Environment Variables** e adicione uma por uma (nome à esquerda, valor à direita, **Add** depois de cada):

   | Nome | Valor |
   |---|---|
   | `DATABASE_URL` | a linha do passo 3 |
   | `SESSION_SECRET` | 40 letras/números aleatórios (digite qualquer coisa longa, ex.: bata no teclado 40 vezes) |
   | `CRON_SECRET` | outra sequência longa aleatória (anote: vai usar na Parte 3) |
   | `APP_TZ` | `America/Sao_Paulo` |
   | `META_ACT_00` | `act_240727500555671` |
   | `META_ACT_01` | `act_210256430938513` |
   | `SEED_SENHA_ERICK` | a senha que VOCÊ vai usar para entrar no app |
   | `SEED_SENHA_IAN` | a senha do Ian |

   As chaves das fontes (`META_TOKEN`, `OPENAI_ADMIN_KEY`, `OPENAI_PROJECT_ID`, `KIE_API_KEY`, `ZENITH_WEBHOOK_SECRET`) você adiciona depois, quando tiver (Settings → Environment Variables → Add → depois **Redeploy**).
8. Clique **Deploy**. Espere 2–3 minutos até "Congratulations". Clique **Continue to Dashboard** e copie o endereço do site (algo como `https://painel-lucro-xxxx.vercel.app`).

## Parte 3 — Criar os usuários e o agendador (10 min)

9. **Usuários, parâmetros, frentes, categorias e ZapData (seed).** Sem instalar nada:
   - Abra no navegador: `https://SEU-SITE.vercel.app/api/seed?segredo=SEU_CRON_SECRET` (troque pelos seus valores). Deve responder `{"ok":true,...}`. Essa rota só funciona com o segredo e só cria o que ainda não existe.
10. **Agendador (coleta a cada 10 min, grátis).** No Supabase → **SQL Editor** → New query → abra `supabase/agendador.sql` do repositório, cole, troque `<SEU-APP>` pelo endereço do site e `<MESMO VALOR DE CRON_SECRET DA VERCEL>` pelo valor do passo 7, e clique **Run**.
    - Para conferir: nova query com `select * from cron.job;` → deve listar `painel-coleta-10min`.
11. Entre no site com `erick` e a senha de `SEED_SENHA_ERICK`. Vá em **Parâmetros** e troque as senhas se quiser. Depois pode apagar `SEED_SENHA_*` da Vercel.

## Parte 4 — Ligar cada fonte (quando tiver a chave)

- **Meta:** Business Manager → Configurações → Usuários do sistema → criar usuário "painel" → **Gerar token** com permissão `ads_read` nas duas contas → colar em `META_TOKEN` na Vercel → Redeploy. No site, **Atualizar agora**; em **Avisos** aparece se a conta entregou dados por hora ou só por dia.
- **OpenAI:** platform.openai.com → Settings → Organization → **Admin keys** → Create → colar em `OPENAI_ADMIN_KEY`. Em Settings → Projects, copie o ID do projeto "Cenas Ligeras" para `OPENAI_PROJECT_ID`.
- **kie.ai:** painel do Ian → API Keys → copiar a "Default" → `KIE_API_KEY`. No site, **Parâmetros** → `kie_usd_por_credito` → preço real por crédito.
- **Zenith:** depende do que existir em Integrações (ver `docs/pendencias.md`). Se houver webhook: URL `https://SEU-SITE.vercel.app/api/zenith/webhook?segredo=VALOR` e defina `ZENITH_WEBHOOK_SECRET` com o mesmo VALOR.

## Se algo der errado
- Site abre mas dá erro 500: quase sempre `DATABASE_URL` errada (senha ou `[YOUR-PASSWORD]` não trocado). Corrija em Settings → Environment Variables → Redeploy.
- "Fonte X não configurada" em Avisos: falta a chave daquela fonte; normal até você colar.
- Projeto do Supabase "paused": clique **Restore project** (acontece se ficar 7 dias sem uso).
