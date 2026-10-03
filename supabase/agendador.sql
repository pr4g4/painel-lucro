-- Agendador gratuito: pg_cron + pg_net do próprio Supabase chamam as rotas de coleta na Vercel a cada 10 min.
-- Cole no SQL Editor do Supabase DEPOIS de publicar na Vercel. Troque os dois valores entre <...>.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda a URL e o segredo no Vault para não ficarem no texto do job
select vault.create_secret('https://<SEU-APP>.vercel.app', 'painel_url');
select vault.create_secret('<MESMO VALOR DE CRON_SECRET DA VERCEL>', 'painel_cron_secret');

-- Coleta de todas as fontes a cada 10 minutos
select cron.schedule(
  'painel-coleta-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'painel_url') || '/api/coleta/todas',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'painel_cron_secret')),
    timeout_milliseconds := 55000
  );
  $$
);

-- Conferir / remover
-- select * from cron.job;
-- select * from cron.job_run_details order by start_time desc limit 20;
-- select cron.unschedule('painel-coleta-10min');
