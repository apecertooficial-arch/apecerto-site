-- Contrato enxuto da vitrine pública.
--
-- A ficha completa continua em public.site_produtos e é buscada somente
-- quando o visitante abre um imóvel ou interage com a galeria. Esta view
-- preserva exatamente as travas editoriais do ERP e nunca cria uma segunda
-- regra de publicação.

create or replace view public.site_produtos_catalogo
with (security_invoker = true)
as
with unidades_publicadas as (
  select
    u.id,
    u.empreendimento_id,
    u.codigo,
    u.numero,
    u.tipologia,
    u.area_m2,
    u.vagas,
    u.valor_tabela,
    u.valor_promo,
    case
      when lower(coalesce(u.tipologia, '')) like '%studio%' then 0
      when substring(coalesce(u.tipologia, '') from '^[[:space:]]*([0-9]+)') is not null
        then substring(u.tipologia from '^[[:space:]]*([0-9]+)')::integer
      else null
    end as dormitorios_calculados
  from public.unidades u
  where u.publicado is true
    and u.disponivel is true
    and u.aprovacao is not distinct from 'aprovado'
),
unidades_agregadas as (
  select
    u.empreendimento_id,
    count(*) as unidades_disponiveis,
    min(coalesce(u.valor_promo, u.valor_tabela)) as preco_min,
    max(coalesce(u.valor_promo, u.valor_tabela)) as preco_max,
    min(u.area_m2) as area_min_disponivel,
    max(u.area_m2) as area_max_disponivel,
    min(u.dormitorios_calculados) as dormitorios_min_disponiveis,
    max(u.dormitorios_calculados) as dormitorios_max_disponiveis,
    min(u.vagas) as vagas_min_disponiveis,
    max(u.vagas) as vagas_max_disponiveis,
    array_agg(distinct u.tipologia order by u.tipologia)
      filter (where u.tipologia is not null) as tipologias_disponiveis,
    json_agg(
      json_build_object(
        'id', u.id,
        'slug',
          coalesce(
            nullif(
              btrim(
                regexp_replace(lower(coalesce(e.slug, '')), '[^a-z0-9]+', '-', 'g'),
                '-'
              ),
              ''
            ),
            'imovel'
          )
          || '-un-'
          || case
            when nullif(
              btrim(
                regexp_replace(lower(coalesce(u.codigo, '')), '[^a-z0-9]+', '-', 'g'),
                '-'
              ),
              ''
            ) is null then ''
            else btrim(
              regexp_replace(lower(u.codigo), '[^a-z0-9]+', '-', 'g'),
              '-'
            ) || '-'
          end
          || u.id::text,
        'codigo', u.codigo,
        'numero', u.numero,
        'tipologia', u.tipologia,
        'area_m2', u.area_m2,
        'vagas', u.vagas,
        'valor', coalesce(u.valor_promo, u.valor_tabela),
        'capa_path', (
          select m.storage_path
          from public.midias m
          where m.unidade_id = u.id
            and m.tipo = 'foto'::public.tipo_midia
          order by m.is_capa desc, m.created_at
          limit 1
        )
      )
      order by u.numero nulls last, u.id
    ) as unidades_site
  from unidades_publicadas u
  join public.empreendimentos e on e.id = u.empreendimento_id
  group by u.empreendimento_id
)
select
  e.id,
  e.nome,
  e.slug,
  e.slogan,
  e.bairro,
  e.endereco,
  e.status,
  e.entrega,
  e.area_util,
  e.dormitorios,
  e.suites,
  e.banheiros,
  e.vagas,
  e.preco,
  e.condominio_valor,
  e.destaque,
  e.ordem,
  coalesce(e.lazer[1:3], '{}'::text[]) as lazer,
  '{}'::text[] as diferenciais,
  e.finalidade,
  null::text as descricao,
  e.iptu,
  e.latitude,
  e.longitude,
  (
    select m.storage_path
    from public.midias m
    where m.empreendimento_id = e.id
      and m.unidade_id is null
      and m.tipo = 'foto'::public.tipo_midia
    order by m.is_capa desc, m.created_at
    limit 1
  ) as capa_path,
  '[]'::json as fotos,
  ua.unidades_disponiveis,
  ua.preco_min,
  ua.preco_max,
  ua.area_min_disponivel,
  ua.area_max_disponivel,
  ua.dormitorios_min_disponiveis,
  ua.dormitorios_max_disponiveis,
  ua.vagas_min_disponiveis,
  ua.vagas_max_disponiveis,
  ua.tipologias_disponiveis,
  e.titulo,
  null::text as tour_url,
  e.cidade,
  e.uf,
  e.codigo,
  ua.unidades_site
from public.empreendimentos e
join unidades_agregadas ua on ua.empreendimento_id = e.id
where e.publicado is true
  and e.rascunho is false
  and e.aprovacao is not distinct from 'aprovado';

revoke all privileges on public.site_produtos_catalogo from public, anon, authenticated;
grant select on public.site_produtos_catalogo to anon, authenticated;

comment on view public.site_produtos_catalogo is
  'Listagem pública leve do site; usa as mesmas aprovações de Produtos e omite galerias e descrição até a hidratação da ficha canônica.';
