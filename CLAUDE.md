# Instruções para editar o site ApêCerto

O arquivo principal e editável do design é:

`design/Site ApeCerto.dc.html`

Edite esse arquivo para alterar layout, cores, textos, componentes ou funções do
site. Ele é o código-fonte legível extraído do pacote exportado pelo Claude
Design.

Não edite diretamente o `index.html`: ele é somente o pacote-base que contém os
recursos incorporados (imagens, fontes e runtime). No deploy, o comando
`npm run build` injeta automaticamente o design atualizado no pacote e gera
`dist/index.html`.

## Integração que deve ser preservada

- O catálogo público consulta a view `site_produtos` do Supabase.
- Somente produtos aprovados pelo gestor no ERP podem aparecer no site.
- Não voltar a consultar `anuncios_site`.
- Não alterar chaves, URLs ou regras da integração sem uma solicitação explícita.

## Validação

Depois de qualquer alteração, execute:

```sh
npm run build
npm test
```

O Render publica a pasta `dist`, gerada a cada deploy.
