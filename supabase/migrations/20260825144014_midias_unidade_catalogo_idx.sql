-- A listagem pública resolve uma única capa para cada unidade aprovada.
-- Esta ordem atende exatamente o filtro e a ordenação da subconsulta da view
-- site_produtos_catalogo, sem ampliar permissões nem alterar os dados.

create index if not exists midias_unidade_tipo_capa_catalogo_idx
  on public.midias (unidade_id, tipo, is_capa desc, created_at)
  where unidade_id is not null;
