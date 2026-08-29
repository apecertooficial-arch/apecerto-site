# Validação Claude × HEAD do Draft PR #34 — 28/08/2026

## Decisão

**PRONTO PARA PEDIR AUTORIZAÇÃO DE PREVIEW**, mantendo o PR como Draft. Os defeitos locais reproduzíveis foram corrigidos e validados no artefato local. A nota não é 10/10: o catálogo público atual tem 71 imóveis e zero coordenadas válidas; variantes responsivas/foco editorial de mídia e o 403 de `site-track` dependem de Produtos/infraestrutura.

Base verificada: `origin/main` `255a7558cd49138f5126c5e343115fb6fe254f66`. Branch: `codex/ux-real-site-20260828`. Nenhum merge, deploy, escrita no Supabase, lead ou evento de produção foi executado.

## Matriz de reprodução

| # | Achado | Classificação no PR | Evidência e conclusão |
|---:|---|---|---|
| 1 | Fotos das fichas | **reproduzido e corrigido** | Cinco fichas tinham URLs válidas, mas 0/5 tiles visíveis porque o mosaico dependia de `data-ape-bg`; substituído por `<img data-ape-src>` com dimensões, prioridade da principal e lazy loading das demais. Cinco fichas passaram com 5/5 imagens carregadas e zero tile vazio. |
| 2 | Galeria | **já corrigido no PR e reconfirmado** | Gatilhos são botões, contador mudou de `1 de 43` para `2 de 43` por teclado, Escape fechou e devolveu foco. Em 390×844 a segunda ficha abriu em `1 de 25`, sem overflow. Swipe permanece coberto por regressão automatizada; a automação CUA não sintetizou toque real. |
| 3 | Mapa/lista | **reproduzido e corrigido localmente; dados externos** | Catálogo: 71 resultados, 0 representados, 71 sem coordenadas. O padrão agora é Lista e Mapa/Dividida não aparecem sem ponto real. Filtro `tipo=studio&area_min=24&area_max=35`: 19 resultados e aviso factual de 19 sem localização. Nenhuma coordenada foi inventada. |
| 4 | Links de bairros/rodapé | **reproduzido e corrigido** | `#apes`/`#buscar` foram removidos das ações visíveis. Bairros usam `/?bairro=<real>` e o rodapé usa URLs reais de finalidade, tipologia, dormitórios, vagas e status. |
| 5 | Contadores | **já corrigido e reconfirmado** | O filtro citado manteve 19 resultados antes da ficha e após “Voltar pros apês”; a query string foi preservada. |
| 6 | Sara | **reproduzido e corrigido** | A função era real, mas o único gatilho estava dentro de um grupo CSS oculto. O gatilho voltou à área progressiva da busca; abre a região “Busca assistida pela Sara” e move foco para o campo, sem submissão ou segredo no cliente. |
| 7 | Anunciar e conta | **reproduzido e corrigido** | `/proprietario/cadastre-seu-imovel/` inicia a avaliação sem login. `/proprietario/` não oferece mais signup que a infraestrutura recusa; mostra login para convidados e orientação WhatsApp factual, sem erro técnico cru. |
| 8 | Tracking 403 | **dependência externa** | Cliente usa Beacon/fetch sem segredo e contrato testado. `supabase/config.toml` não declara `site-track`, enquanto funções públicas equivalentes têm `verify_jwt=false`; o gateway pode rejeitar antes da validação da função. Handoff separado, sem alteração externa. |
| 9 | Comprar versus alugar | **reproduzido e corrigido** | Conteúdo principal, guia, FAQ e rodapé agora refletem compra. Locação só aparece se o catálogo publicar oferta correspondente. |
| 10 | Taxonomia | **reproduzido e corrigido** | Brooklin, Ibirapuera, Moema Pássaros/Índios e demais rótulos editoriais sem correspondência foram removidos da navegação dinâmica. |
| 11 | Dados da ficha | **reproduzido e corrigido na apresentação** | Zero vaga virou “Sem vaga”; pluralização e identidade pública evitam cidade duplicada. Preço, área, endereço e mídia da fonte não foram alterados. |
| 12 | Mídia/performance | **parcialmente local; dependência externa** | Mosaico não pré-carrega o álbum: primeira foto é prioritária, demais lazy, galeria prepara apenas vizinhas. A bateria anterior teve filtros 0/0/0 long tasks, scroll 0/1/0 (máx. 63 ms), galeria 0/0/0. `srcset` real ainda depende de variantes seguras em `site-media`. |
| 13 | Hero intermitente | **não reproduzido no HEAD** | Imagem tem dimensões, ativo estável e fallback já versionado. Recargas locais não produziram hero branco. |
| 14 | SEO social | **já corrigido e reconfirmado** | HTTP direto antes do JS entregou HTML distinto para Studio em Campo Belo e Apartamento com 1 quarto em Moema, com canonical, OG e JSON-LD. Smoke SEO aprovou 2 fichas e 1 slug 404/noindex. |
| 15 | Acessibilidade/mobile | **reproduzido e corrigido** | Drawer e galeria têm nome, foco inicial, Escape/botão e devolução de foco. 390×844 sem overflow; controles têm alvo de 44/48 px. Screenshots 360/414 e 1280/1440 anteriores continuam válidos para áreas não alteradas. |
| 16 | Favoritos | **já corrigido e reconfirmado** | “Salvar” persistiu como “Salvo” após reload e voltou a “Salvar” ao remover. Limitação honesta: persistência é local ao navegador, não uma conta sincronizada. |

## Causas-raiz e correções desta rodada

1. **Mosaico vazio:** o hydrator de `background-image` não refletia o valor resolvido no estilo computado da ficha. O mosaico e as miniaturas agora usam o mesmo ativador seguro de imagens empregado pelos cards.
2. **Mapa enganoso:** o modo salvo “Dividida” prevalecia mesmo com zero pontos. A representação é calculada antes do modo efetivo; zero pontos força Lista e oculta modos sem conteúdo.
3. **Navegação falsa:** links editoriais apontavam a âncoras genéricas. As URLs e handlers agora nascem dos valores publicados do catálogo.
4. **Portal sem saída:** a UI oferecia signup embora o Auth recusasse novos cadastros. O caminho público indisponível foi removido e substituído por orientação factual.
5. **Sara invisível:** a refatoração progressiva ocultou o grupo que continha o único gatilho. O painel real foi movido para uma ação visível, mantendo o mesmo contrato e foco.

## Verificações

- Build completo: `e042c486b1a85f58`; design `3a7d90868fcd`; 6 rotas.
- Verificador bloqueante: aprovado.
- Testes: **123/123** aprovados.
- Smoke HTTP: 6 rotas ativas e 1 desativada; HTML 30.342 B bruto / 11.046 B gzip; inicial 378.941 B.
- Smoke SEO: 2 fichas distintas e 1 slug 404/noindex.
- Não existem scripts separados de lint ou typecheck no `package.json`; os checks reais do projeto são build, testes, verificador e smokes.

O servidor auxiliar `serve-dist.mjs` devolve texto simples para caminhos físicos ausentes; ele não emula sozinho a Edge usada pela regra dinâmica. Por isso a prova 404/noindex foi feita no smoke HTTP da função/contrato, não atribuída indevidamente ao servidor estático auxiliar.

## Evidências visuais

- [Ficha desktop com mosaico real](evidencias/ux-real-2026-08-28/claude-validacao-desktop-ficha.png)
- [Resultados filtrados em 390×844](evidencias/ux-real-2026-08-28/claude-validacao-mobile-filtros.png)
- [Segunda ficha em 390×844](evidencias/ux-real-2026-08-28/claude-validacao-mobile-ficha-2.png)
- [Galeria em 390×844](evidencias/ux-real-2026-08-28/claude-validacao-mobile-galeria.png)
- Evidências anteriores ainda válidas: home 1280/1440, home 390, mapa vazio honesto, Anunciar e medições em `docs/evidencias/ux-real-2026-08-28/`.

## Nota ponderada atual

| Área | Peso | Nota | Contribuição |
|---|---:|---:|---:|
| Experiência visual desktop | 15% | 9,0 | 1,350 |
| Experiência visual mobile | 15% | 8,9 | 1,335 |
| Ficha, fotos e galeria | 20% | 9,1 | 1,820 |
| Busca, filtros, URLs e bairros | 15% | 9,2 | 1,380 |
| Mapa e integridade geográfica | 10% | 6,8 | 0,680 |
| Conversão e fluxos reais | 10% | 7,6 | 0,760 |
| Desempenho/fluidez | 10% | 8,2 | 0,820 |
| Acessibilidade e confiança | 5% | 8,9 | 0,445 |

**Nota local ponderada: 8,590/10.** Não há defeito local crítico conhecido que imponha teto de 6; mapa completo, mídia responsiva e telemetria ainda impedem nota máxima e precisam ser validados num preview real.

## Riscos residuais

- mapa completo bloqueado pelas coordenadas públicas de Produtos;
- capas sem foco editorial e sem variantes responsivas da origem;
- `site-track` sujeito a 403 até a configuração pública segura ser revisada e publicada pelo responsável de infraestrutura;
- Core Web Vitals de campo e rede/console de hospedagem ainda não comprovados sem preview;
- o comportamento 404/noindex externo depende da regra Edge/Render e deve ser gate explícito do preview.
