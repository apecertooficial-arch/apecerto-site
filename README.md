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
npm run build
npm test
```

O Render deve usar:

- Build command: `npm run build`
- Publish directory: `dist`
- Auto-deploy: `On Commit`

Assim, cada alteração aprovada e enviada à branch `main` gera uma nova versão do
site automaticamente, sem mudar o fluxo de produtos do ERP.
