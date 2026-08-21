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
aprovada `site_produtos`. `GET /sitemap.xml` é reescrito pelo Render para essa
função e reúne as seis rotas fixas, os empreendimentos e cada unidade publicada.
O build gera `dist/sitemap-static.xml` apenas como gate determinístico da CI;
`dist/sitemap.xml` é proibido porque um arquivo físico teria precedência sobre o
rewrite. O `robots.txt` continua apontando para o endereço público dinâmico.

O handler também já sabe montar as páginas `/imovel/<slug>/` com title,
canonical, descrição, Open Graph e JSON-LD, além de 404 com `noindex`. Esse
rewrite HTML permanece deliberadamente desativado: a URL padrão de Edge
Functions do Supabase transforma respostas HTML em `text/plain`. Ele só pode ser
ativado depois de configurar um custom domain compatível; os testes e o
verificador bloqueiam a ativação acidental pela URL `*.supabase.co`.

Ordem de publicação: primeiro publicar `site-seo` com `verify_jwt = false` e
confirmar que a URL direta de `/sitemap.xml` responde `200` com XML íntegro. O
gateway hospedado do Supabase pode expor essa resposta como `text/plain`; por
isso o Blueprint fixa `Content-Type: application/xml; charset=utf-8` no endereço
público `https://apecerto.com/sitemap.xml`. Esse endereço público deve ser
validado depois do deploy do Render. O repositório não executa essas duas
publicações durante o build.

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
