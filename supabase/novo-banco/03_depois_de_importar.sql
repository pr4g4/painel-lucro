-- PASSO 5 da mudança de banco: rode DEPOIS de importar os CSVs no projeto novo.
-- Os CSVs trazem os ids antigos; isto avisa cada contador de id para continuar de onde parou (senão a próxima gravação daria "id duplicado").
do $$
declare t text;
begin
  foreach t in array array['usuarios','tentativas_login','parametros','frentes','campanhas','lancamentos','vendas','categorias','lancamentos_manuais','cambio','coletas','avisos','zenith_eventos','alertas','visoes_salvas'] loop
    execute format('select setval(pg_get_serial_sequence(%L, ''id''), coalesce((select max(id) from %I), 0) + 1, false)', t, t);
  end loop;
end $$;

-- Conferência: deve listar as tabelas com a quantidade de linhas importadas
select 'usuarios' as tabela, count(*) from usuarios union all select 'parametros', count(*) from parametros union all select 'frentes', count(*) from frentes
union all select 'campanhas', count(*) from campanhas union all select 'lancamentos', count(*) from lancamentos union all select 'vendas', count(*) from vendas
union all select 'categorias', count(*) from categorias union all select 'lancamentos_manuais', count(*) from lancamentos_manuais union all select 'cambio', count(*) from cambio
union all select 'coletas', count(*) from coletas union all select 'avisos', count(*) from avisos union all select 'zenith_eventos', count(*) from zenith_eventos
union all select 'alertas', count(*) from alertas union all select 'visoes_salvas', count(*) from visoes_salvas order by 1;
