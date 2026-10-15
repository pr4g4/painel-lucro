# Passo 2 — Banco, marco zero, parâmetros com vigência e login

Concluído em 15/10/2026. Decisões tomadas sem o Erick (ele pediu para seguir sozinho), com padrões seguros.

## Decisões do passo 1 fechadas por padrão
1. **Zenith**: sem API pública encontrada. Plano no passo 4: primeiro importação de CSV/exportação do painel; se a Zenith tiver webhook/API, troco; extensão do Chrome fica como último recurso.
2. **Hospedagem**: Railway (app + Postgres + worker). O Erick só cria a conta quando chegar o passo 7, com passo a passo.
3. **Rede do ambiente**: construir com dados de teste; coletores são validados no host de produção (ou quando os domínios forem liberados).
4. Quadro e arquitetura do passo 1 considerados aprovados.

## O que existe e funciona
- Next.js 16 (App Router, TypeScript, Tailwind 4) + Postgres 16 + Drizzle ORM. Cache de página desligado (`cacheComponents: false`).
- Tabelas: `usuarios`, `sessoes`, `tentativas_login`, `frentes`, `parametros`, `categorias`, `cambio`, `campanhas`, `lancamentos`, `vendas`, `lancamentos_manuais`, `avisos`, `coleta_log`, `visoes_salvas`. Migração em `drizzle/0000_*.sql`.
- Idempotência garantida por índices únicos: `lancamentos.chave_unica`, `(vendas.fonte, id_origem)`, `(cambio.moeda, data)`.
- **Parâmetros com vigência**: `parametroVigente(chave, instante)` escolhe a linha com `vigencia_inicio <= instante < vigencia_fim`. `definirParametro` fecha a vigência aberta e abre a nova; recusa início anterior ao da vigência aberta. Testado: mudar hoje não altera o passado.
- Seed (idempotente): erick (edita), ian (vê); frentes Fotos IA MX (ativa), Cenas Ligeras e Embarazo (encerradas); 6 categorias; parâmetros desde 01/09/2026: Meta 12,15 %, Zenith 7,99 % + fixa MX$ 5 / R$ 5, câmbio 2 %, imposto 8 % com base `lucro_bruto`; **ZapData** como lançamento recorrente mensal R$ 119 a partir de 02/10/2026 (não é parâmetro, para não contar duas vezes).
- **Login**: argon2id, cookie `sessao` httpOnly + SameSite=Lax (+ Secure em produção), token aleatório guardado como SHA-256, 30 dias; limite de 5 tentativas por 15 min por IP+usuário; tempo de resposta igual para usuário inexistente. Papéis: `exigirEdicao()` barra o Ian em qualquer gravação.

## Testes que passaram
- `npm test`: vigência (início inclusivo, fim exclusivo, passado imutável, fator Meta 1,1383) e seed 2× sem duplicar.
- `tests/e2e-login.mjs` (Chromium real): redireciona sem sessão; senha errada; bloqueio na 6ª tentativa; Erick entra como "edita" e sai; token falso não entra.
- `npm run build`, `npm run lint`, `npm run typecheck` limpos.

## Variáveis de ambiente (só nomes)
`DATABASE_URL`, `SESSION_SECRET`, `TZ`, `ERICK_SENHA_INICIAL`, `IAN_SENHA_INICIAL`. Previstas: `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_IDS`, `OPENAI_ADMIN_KEY`, `OPENAI_PROJECT_ID`, `KIE_API_KEY`, `ALERTA_WHATSAPP_DESTINO`.

## Pendências
- Tela de troca de senha (função `trocarSenha` pronta; tela entra no passo 6).
- Fase 1.5: metas e alerta WhatsApp.
