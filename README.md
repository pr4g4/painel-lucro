# painel-lucro

App web de lucro em tempo quase real (fase 1: só leitura). Next.js 15 + Postgres (Supabase) + Drizzle.

- `docs/passo1.md` — viabilidade das fontes e arquitetura
- `docs/como-publicar.md` — passo a passo para publicar de graça (Supabase + Vercel)
- `docs/pendencias.md` — o que depende do Erick

Desenvolvimento local:

```bash
cp .env.example .env.local   # ajuste DATABASE_URL
npm install
npx drizzle-kit migrate       # cria as tabelas
npm run seed                  # usuários, parâmetros, frentes, ZapData e dados de exemplo
npm run dev                   # http://localhost:3000
npm test                      # testes do motor de cálculo e dos coletores
```
