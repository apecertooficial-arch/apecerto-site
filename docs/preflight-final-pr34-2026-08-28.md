# Preflight final do Draft PR #34 — 28/08/2026

## Decisão antes do preview

O código do PR está **apto a entrar no preview após a correção de hospedagem abaixo**. O preflight confrontou integralmente os 19 bugs numerados da auditoria Claude com a produção atual e o artefato local. A ocorrência introdutória `BUG-00` foi excluída porque o próprio prompt técnico determinou ignorá-la.

- PR: `#34`, ainda Draft durante este preflight.
- Branch: `codex/ux-real-site-20260828`.
- HEAD inicialmente auditado: `e68ee59fbe3ab8b500798fe99f7b848c8d379497`.
- Base atual: `origin/main` `255a7558cd49138f5126c5e343115fb6fe254f66`.
- CI desse HEAD: `Site production gate`, execução 142, verde.
- Produção estável registrada para rollback: commit `255a7558cd49138f5126c5e343115fb6fe254f66`, deploy Render `dep-da8sk5k9v7es73cg72f0`, `/version.json` `1f70df31b3f3b230`.

## Matriz final dos 19 bugs

| # | ID Claude | Produção atual | PR #34 / decisão |
|---:|---|---|---|
| 1 | IMG-01 | **Falha reproduzida.** O mosaico da ficha mantém cinco `data-ape-bg`, mas nenhum background é aplicado. | **Corrigido.** Mosaico usa imagens reais, dimensões explícitas, primeira imagem prioritária e demais lazy. Cinco fichas foram validadas. |
| 2 | IMG-02 | Galeria já abre e avança; o achado original não existe mais na versão publicada. | **Preservado e endurecido.** Nome acessível, teclado, Escape, botão e devolução de foco têm regressão automatizada. |
| 3 | MAP-03 | **Falha reproduzida.** Modo Dividida pode ser oferecido mesmo quando o catálogo público não contém coordenadas válidas. | **Corrigido sem inventar dados.** Zero pontos força Lista e oculta controles sem conteúdo. O filtro citado retorna 19 imóveis e aviso factual de 19 sem localização. |
| 4 | AUTH-04 | Portal ainda oferece criação de acesso que a infraestrutura não entrega publicamente. | **Corrigido na interface.** Login existente é mantido; signup impossível foi removido e substituído por orientação WhatsApp. Anunciar continua público. |
| 5 | TRACK-05 | O gateway público de `site-track` pode responder 403 antes da função. | **Dependência externa, não enfraquecida.** Cliente continua sem segredo, usa contrato testado e falha sanitizada. Não houve mudança em Supabase/Auth. |
| 6 | LINKS-06 | **Falha reproduzida.** Ações editoriais ainda usam âncoras genéricas `#apes`/`#buscar`. | **Corrigido.** Bairros e rodapé usam queries reais e valores publicados do catálogo; zero links falsos visíveis no filtro testado. |
| 7 | SARA-07 | A Sara já abre e move foco na produção atual; o achado original ficou obsoleto. | **Preservado.** Gatilho permanece visível e acessível na busca progressiva. |
| 8 | CONTENT-08 | Produção ainda mistura mensagens editoriais antigas em alguns estados. | **Corrigido.** Conteúdo principal, guia, FAQ e rodapé refletem compra; locação só aparece quando existir oferta real. |
| 9 | DATA-09 | **Falha reproduzida.** Há `0 vaga` e cidade duplicada em exemplos reais. | **Corrigido na apresentação.** Exibe “Sem vaga”, pluralização e identidade pública determinísticas. Preço, endereço e mídia seguem Produtos e não foram alterados. |
| 10 | TAXO-10 | Taxonomia editorial antiga ainda não corresponde integralmente ao catálogo. | **Corrigido.** Navegação dinâmica deriva somente de bairros/tipos/status publicados. |
| 11 | SHARE-11 | SEO das fichas já entrega metadados distintos; imagem social oficial responde 200 JPEG, 65.383 B e cache imutável. | **Preservado.** Canonical, OG, Twitter e JSON-LD continuam factuais. O gate de preview deve comprovar duas fichas antes do JavaScript. |
| 12 | COUNT-12 | Contadores e retorno já preservam a query na produção atual. | **Preservado.** O filtro mantém 19 resultados antes da ficha e após voltar. |
| 13 | PERF-13 | Mosaico quebrado invalida a experiência percebida apesar de não baixar imagens. | **Corrigido localmente.** Primeira foto prioritária, álbum lazy e vizinhas preparadas na galeria. Variantes responsivas da mídia ainda dependem da origem. |
| 14 | HERO-14 | Hero branco/intermitente não foi reproduzido na versão atual. | **Preservado.** Ativo versionado, dimensões e fallback permanecem; recargas locais não produziram flash vazio. |
| 15 | BRAND-15 | Páginas auxiliares antigas ainda usam capitalização histórica em texto/SEO. | **Parcial e deliberado.** A experiência principal usa a identidade oficial; não foi feita reescrita ampla de conteúdo estático fora dos defeitos reproduzíveis. |
| 16 | SEARCH-16 | A busca usa query na home em vez de rota `/buscar`. | **Resolvido por arquitetura equivalente.** URL filtrada é compartilhável, restaura estado, entra em modo de resultados e preserva voltar; não foi criada rota redundante. |
| 17 | FAV-17 | Favoritos já persistem no navegador, sem conta sincronizada. | **Preservado com limitação explícita.** Adicionar, recarregar e remover foram testados; sincronização entre dispositivos não é prometida. |
| 18 | A11Y-18 | Produção não possui todas as correções de foco do PR. | **Corrigido.** Drawer de filtros e galeria têm nome, trap, Escape/botão e devolução de foco; alvos móveis preservam 44/48 px. |
| 19 | MOBILE-19 | Sem overflow nos tamanhos testados, mas a organização anterior mantém controles menos claros. | **Corrigido e validado.** 360, 390, 414, 1280 e 1440 sem overflow horizontal; CTA e selects não truncam no PR. |

## Validações diretas

- Cinco fichas distintas verificadas em produção e local.
- Produção: os cinco tiles do mosaico continuam como backgrounds não aplicados; PR: imagens reais carregam, sem recurso quebrado e com lazy loading abaixo da dobra.
- Filtro `/?tipo=studio&area_min=24&area_max=35`: 19 cards, 19 sem coordenadas; o PR mostra Lista e aviso factual, sem marcador inventado.
- Anunciar inicia avaliação sem login; portal do PR não promete signup indisponível.
- Sara abre e move foco para o campo.
- Duas fichas válidas retornam HTML e metadados distintos; slug inexistente retorna 404/noindex.
- Console do navegador: nenhum erro registrado nas abas de produção e local usadas no preflight.
- Imagem social oficial da home: `image/jpeg`, 65.383 B, `Cache-Control: public, max-age=31536000, immutable`.
- Viewports: 360×844, 390×844, 414×896, 1280×800 e 1440×900, todos sem overflow horizontal.

## Correção de hospedagem descoberta

O slug inexistente em produção retorna 404 e `noindex`, porém o proxy externo faz o Render responder `Content-Type: text/plain`. O PR passa a declarar `Content-Type: text/html; charset=utf-8` para `/imovel/*` no Blueprint e adiciona verificação bloqueante. O preview real é o gate que comprovará se o header do Static Site também cobre a resposta do rewrite externo.

## Evidências visuais do preflight

- `docs/evidencias/ux-real-2026-08-28/preflight/producao-ficha-1440x900.png`
- `docs/evidencias/ux-real-2026-08-28/preflight/local-ficha-1440x900.png`
- `docs/evidencias/ux-real-2026-08-28/preflight/producao-filtros-390x844.png`
- `docs/evidencias/ux-real-2026-08-28/preflight/local-filtros-390x844.png`

## Bloqueios externos que permanecem

1. Coordenadas públicas de Produtos: 71 imóveis e zero coordenadas válidas impedem um mapa completo.
2. Variantes responsivas e foco editorial das capas dependem do pipeline de mídia/Produtos.
3. A autorização não cobre Supabase; portanto o 403 do `site-track` deve ser resolvido pelo responsável de infraestrutura sem expor segredo nem abrir escrita indiscriminada.
4. Core Web Vitals de campo exigem tráfego real posterior; nesta entrega só são válidas métricas de laboratório.

