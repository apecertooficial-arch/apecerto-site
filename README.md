# Site ApêCerto

Este repositório contém o design do site, a integração com os produtos aprovados
do ERP e a configuração de publicação automática.

## Onde editar o design

Abra **`design/Site ApeCerto.dc.html`**. Esse é o arquivo-fonte legível que pode
ser lido e editado por ferramentas de design conectadas ao GitHub.

O `index.html` da raiz é o pacote-base exportado, com imagens, fontes e runtime
incorporados. Ele não deve ser usado como arquivo de edição. Durante o deploy,
`scripts/build-site.mjs` combina o pacote-base com o design e gera o site final
em `dist/index.html`.

## Publicação

```sh
npm run ci
```

O Render deve usar:

- Build command: `npm run ci`
- Publish directory: `dist`
- Auto-deploy: somente depois dos checks aprovados (`checksPass`)

Assim, cada alteração aprovada e enviada à branch `main` gera uma nova versão do
site automaticamente, sem mudar o fluxo de produtos do ERP. O build é
determinístico e usa somente fontes versionadas no repositório: não baixa nem
aplica payload temporário durante a publicação.

Antes de publicar, a CI valida conteúdo, links, rotas, fingerprints e limites de
tamanho, além de executar um smoke HTTP local. Os arquivos estáticos recebem nome
por conteúdo e cache imutável; `version.json` identifica exatamente as fontes e
os artefatos de cada pacote.

As rotas públicas incluem a área do proprietário e o cadastro do imóvel. Fichas
de imóveis usam URLs limpas no formato `/imovel/<slug>/`; o Render reescreve essa
rota para o shell da aplicação sem transformar a navegação em erro 404.

### Detector de drift da regra legada

O serviço atual também mantém regras no dashboard do Render. Para comparar um
snapshot sanitizado dessas regras com o `render.yaml`, execute:

```sh
RENDER_ACTIVE_RULES_JSON='[{"source":"/imovel/*","destination":"https://diaegvfveqezispcthwk.supabase.co/functions/v1/site-seo/imovel/*","action":"rewrite"}]' npm run check:render-drift
```

O snapshot não contém token, cabeçalho ou configuração de ambiente. Em automação,
obtenha-o por uma integração read-only e injete somente os três campos acima.
Ausência, duplicidade, mudança de ação ou destino faz o comando falhar fechado.

## SEO dinâmico do catálogo

O contrato público de Produtos (views, RLS e funções de redução de identidade,
endereço e mídia) tem como fonte de verdade o repositório do ERP. As migrations
históricas deste repositório do site não devem ser reaplicadas isoladamente: elas
precedem o contrato privado/público vigente e podem conter projeções antigas. O
site consome apenas `site_produtos`/`site_produtos_catalogo` já endurecidas e
aceita fotos somente por token opaco `midia:<uuid>` resolvido em `site-media`.

A função pública `supabase/functions/site-seo/index.ts` e o build leem somente
a view aprovada `site_produtos`, usando a mesma URL e chave pública já presentes
no frontend. O build publica `/sitemap.xml` como índice físico, gera
`/sitemap-catalogo.xml` a partir do mesmo snapshot validado e pré-renderiza cada
slug canônico em `dist/imovel/<slug>/index.html`. O corpo continua sendo a mesma
aplicação dinâmica, alimentada pelo feed público; apenas os metadados iniciais
são congelados no momento do build.

`dist/sitemap-static.xml` continua sendo o gate determinístico das seis rotas
fixas. `dist/sitemap-catalogo.xml` contém essas rotas e todas as fichas válidas
do snapshot. O `robots.txt` aponta para o índice público
`https://apecerto.com/sitemap.xml`, e o Blueprint solicita o Content-Type XML
tanto no índice quanto no catálogo.

Cada ficha pré-renderizada recebe title, canonical, descrição, Open Graph,
Twitter Card e JSON-LD factuais e escapados. Registros sem identidade ou
metadados mínimos fazem o build falhar; slugs inexistentes usam o `404.html`
noindex do host estático. O build também registra data e hash não pessoal do
catálogo em `version.json` e falha se a visão pública estiver indisponível.

Antes do merge, o Preview do Render deve comprovar duas fichas distintas com
`Content-Type: text/html`, uma rota inexistente com 404/noindex, sitemap e assets.
As fichas pré-renderizadas continuam físicas; o rewrite `/imovel/*` só atende o
fallback legado/404 no Edge `site-seo`. Sitemap não recebe rewrite.
Como os metadados são snapshot do build, um imóvel recém-publicado no ERP entra
imediatamente no corpo dinâmico, mas sua página SEO inicial exige novo build.

## Orçamento de desempenho

O runtime exportado pelo Cloud Design precisa carregar o template completo. Para
não manter esse conteúdo dentro do documento inicial, o build o publica como
asset imutável e deixa no HTML apenas o carregador. Os limites bloqueantes são:

- HTML inicial: até 150 KB bruto e 30 KB gzip;
- template externo: até 500 KB bruto;
- transferência inicial local estimada: até 500 KB, já considerando compressão;
- imagens inline: no máximo 32 KB cada.

Na validação de referência desta revisão, o HTML mediu 24.876 bytes bruto / 9.395
bytes gzip, o template 368.295 bytes bruto / 69.870 bytes gzip e a transferência
inicial 467.580 bytes. A foto principal também é publicada em AVIF, WebP e JPEG
responsivos; JPEG permanece como fallback.
