# Painel de Lucro

App web com login que mostra, em tempo quase real, quanto entrou, quanto saiu e quanto sobrou de lucro líquido depois de imposto, em qualquer janela de tempo (com hora). Fase 1: só leitura.

- Especificação e decisões: `docs/`
- Marco zero: 03/10/2026 00:00 (Brasília). Tudo antes é histórico, fora dos totais por padrão.

## Rodar localmente

```bash
cp .env.example .env     # preencha DATABASE_URL, SESSION_SECRET e as senhas iniciais
npm install
npm run db:migrate       # cria as tabelas
npm run db:seed          # usuários, frentes, categorias, parâmetros com vigência, ZapData recorrente
npm run dev              # http://localhost:3000
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run db:generate` | gera migração a partir de `src/db/schema.ts` |
| `npm run db:migrate` | aplica migrações |
| `npm run db:seed` | seed idempotente (pode rodar várias vezes) |
| `npm run db:reset` | zera o banco de desenvolvimento (recusa em produção) |
| `npm test` | testes de vigência de parâmetros e idempotência do seed (precisa de banco) |
| `node tests/e2e-login.mjs http://localhost:3000` | teste de login em navegador real (Playwright) |
| `npm run lint` / `npm run typecheck` | lint e tipos |

## Estrutura

- `src/db/schema.ts` tabelas; `src/db/seed.ts` seed
- `src/lib/parametros.ts` parâmetros com vigência (`parametroVigente(chave, instante)`)
- `src/lib/auth.ts` login (argon2, sessão httpOnly, limite de tentativas), papéis `edita`/`ve`
- `src/lib/tempo.ts` marco zero, fusos
- `src/proxy.ts` barreira de autenticação nas rotas
