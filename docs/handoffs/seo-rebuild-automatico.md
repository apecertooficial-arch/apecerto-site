# Handoff — atualização automática do SEO das fichas

## Objetivo

Disparar um novo build do Static Site quando a visão pública canônica do catálogo mudar, para reduzir a defasagem entre publicação no ERP e os metadados HTML pré-renderizados.

## Estado atual

- O build consulta exclusivamente `site_produtos` com a chave pública já usada pelo Site.
- As fichas e o sitemap são gerados a partir dessa mesma visão.
- O corpo da ficha continua carregando o catálogo público dinamicamente.
- Os metadados são um snapshot do momento do build.

## Implementação futura mínima

1. Detectar publicação/despublicação aprovada no fluxo já existente do ERP.
2. Acionar um deploy hook restrito do serviço Static Site no Render.
3. Aplicar debounce e idempotência para consolidar alterações próximas.
4. Registrar apenas identificador técnico da execução, horário e resultado; nunca dados privados do imóvel.
5. Manter falha segura: se o catálogo público não puder ser validado, o build deve falhar e a versão estável deve permanecer publicada.

## Critérios de aceite

- publicação aprovada inicia um build em até cinco minutos;
- ficha nova e sitemap aparecem após CI/deploy verde;
- despublicação deixa de gerar HTML indexável;
- falha do catálogo não publica artefato parcial;
- nenhum segredo do Render chega ao navegador ou ao repositório.

## Fora de escopo deste PR

Webhook no ERP, segredo de deploy, banco, RLS e configuração do serviço Render.
