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

## SEO dinâmico do catálogo

A função pública `supabase/functions/site-seo/index.ts` lê somente a view
aprovada `site_produtos`. O build publica `/sitemap.xml` como um sitemap index
físico e estável, contendo uma única referência para `/sitemap-catalogo.xml`.
Somente essa segunda rota é reescrita pelo Render para a função, que reúne as
seis rotas fixas, os empreendimentos e cada unidade publicada. Essa separação
impede que um sitemap estático antigo esconda o catálogo atual por precedência
de arquivo no host.

`dist/sitemap-static.xml` continua sendo o gate determinístico das seis rotas
fixas. Já `dist/sitemap-catalogo.xml` é proibido, pois um arquivo físico nesse
caminho impediria o rewrite dinâmico. O `robots.txt` aponta para o índice público
`https://apecerto.com/sitemap.xml`, e o Blueprint solicita o Content-Type XML
tanto no índice quanto no catálogo.

O handler também monta as páginas `/imovel/<slug>/` com title, canonical,
descrição, Open Graph, Twitter Card e JSON-LD, além de 404 com `noindex`. O
Blueprint prepara um rewrite externo para esse handler e fixa o `Content-Type`
final como `text/html; charset=utf-8`, preservando a URL pública da ficha. Como
o site continua estático, essa integração precisa ser comprovada em um Preview
do Render antes do merge: duas fichas devem responder HTML específico via HTTP
direto, e uma ficha inexistente deve responder 404 com `noindex`. O verificador
bloqueia divergências entre o endpoint, o rewrite e o header.

Ordem de publicação: primeiro confirmar que `site-seo`, já publicado com
`verify_jwt = false`, responde `200` com XML íntegro e HTML específico. Depois,
validar o Preview do PR por requisição HTTP direta antes de autorizar o merge.
Somente após essa prova, validar o índice público em
`https://apecerto.com/sitemap.xml` e o catálogo em
`https://apecerto.com/sitemap-catalogo.xml`. O índice físico deve responder
`Content-Type: application/xml; charset=utf-8`. O gateway padrão do Supabase
pode expor o catálogo dinâmico como `text/plain` mesmo com o header XML pedido
ao Render; nesse caso o corpo ainda precisa ser XML íntegro e conter o catálogo
completo. O repositório não executa essas duas publicações durante o build.

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
