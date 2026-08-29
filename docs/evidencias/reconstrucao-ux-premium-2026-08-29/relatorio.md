# Evidências finais — reconstrução UX premium do Site ApêCerto

Data da auditoria pós-produção: 29/08/2026

Status: **publicado e auditado em produção**. Este documento substitui o estado anterior de preview.

Produção auditada: [https://apecerto.com](https://apecerto.com)

PR: [#36 — Reconstruir busca, mapa, ficha e privacidade do Site](https://github.com/apecertooficial-arch/apecerto-site/pull/36)

Merge em `main`: [`1d42c4f7096f16311f943086681291526a00ab0b`](https://github.com/apecertooficial-arch/apecerto-site/commit/1d42c4f7096f16311f943086681291526a00ab0b)

Deploy Render ativo: `dep-da956i9f2nfc73easam0`, manual, estado `live`, servindo o merge acima.

Rollback registrado antes da publicação: commit `a8b2ac436a21836cbccd34813472b15114a06f66`, deploy Render `dep-da954d2jnfac73cn6bm0`. A restauração segura é feita pelo botão **Rollback** desse deploy no histórico do serviço; depois devem ser repetidos `/version.json`, home, busca/mapa, ficha, 404 e assets.

## Identidade do artefato em produção

`https://apecerto.com/version.json` respondeu HTTP 200 com:

- pacote funcional `f8e11515cdc71ca8`;
- `designSha256` `f0d4715248416f29a89590c4ec0364f10cb4972ee8c5f537d6399858509bc9aa`;
- catálogo gerado em `2026-08-29T03:34:39.880Z`;
- hash do catálogo `0c1c11f9c7d4d883814f7d59727d11857a82f6c3394288426498044433dafeb9`;
- 53 linhas canônicas e 124 páginas pré-renderizadas.

O painel do Render mostrou, no mesmo histórico, `dep-da956i9f2nfc73easam0` como `live` para `1d42c4f…` e o deploy imediatamente anterior `dep-da954d2jnfac73cn6bm0` para `a8b2ac4…`, com rollback disponível.

Evidências: [`pos-producao/http-seo-producao.json`](pos-producao/http-seo-producao.json) e [`pos-producao/render-deploy-final.png`](pos-producao/render-deploy-final.png).

## Evidência visual pós-produção

As capturas abaixo foram feitas diretamente em `apecerto.com`, sem mock, sem alteração de dados e sem envio de formulário.

| Largura | Home | Busca lista + mapa | Filtros | Ficha | Galeria |
|---|---|---|---|---|---|
| 1440×900 | [`home`](pos-producao/producao-home-1440x900.png) | [`busca/mapa`](pos-producao/producao-busca-mapa-1440x900.png) | [`filtros`](pos-producao/producao-filtros-1440x900.png) | [`ficha`](pos-producao/producao-ficha-1440x900.png) | [`galeria`](pos-producao/producao-galeria-1440x900.png) |
| 1280×800 | [`home`](pos-producao/producao-home-1280x800.png) | [`busca/mapa`](pos-producao/producao-busca-mapa-1280x800.png) | [`filtros`](pos-producao/producao-filtros-1280x800.png) | [`ficha`](pos-producao/producao-ficha-1280x800.png) | [`galeria`](pos-producao/producao-galeria-1280x800.png) |
| 390×844 | [`home`](pos-producao/producao-home-390x844.png) | [`busca/mapa`](pos-producao/producao-busca-mapa-390x844.png) | [`filtros`](pos-producao/producao-filtros-390x844.png) | [`ficha`](pos-producao/producao-ficha-390x844.png) | [`galeria`](pos-producao/producao-galeria-390x844.png) |

Revisão visual das 15 capturas:

- home com hero, busca e início do inventário dentro da dobra nas três larguras;
- desktop com lista/mapa dividido e controles compactos; mobile com alternância Lista/Mapa;
- sem overflow horizontal em 1440, 1280 ou 390 px;
- filtros em painel lateral no desktop e bottom sheet no mobile, sem truncamento de campo ou CTA;
- ficha sem a home montada atrás, título responsivo, mosaico editorial e CTA móvel;
- cinco imagens distintas e totalmente carregadas no mosaico da ficha testada; a primeira é interior;
- galeria nomeada, navegável, com miniaturas e retorno de foco ao gatilho.

As comparações anteriores com Airbnb e QuintoAndar continuam disponíveis em `../ux-real-2026-08-28/`. Elas são referências de densidade e fluxo, não cópias de identidade.

## Busca, lista e mapa

Reprodução: `/?tipo=studio&area_min=24&area_max=35`.

Resultado nas três larguras:

- texto: `19 apês encontrados`;
- aviso: `Localização aproximada: os 19 imóveis aparecem pela região do bairro, nunca pelo endereço exato.`;
- mapa visível e funcional;
- 9 marcadores agrupados, cujos títulos representam `1+1+4+7+1+1+1+1+2 = 19` unidades;
- lista preservada, filtros refletidos na URL e sem overflow;
- nenhum endereço exato foi usado para posicionar o imóvel.

Os pontos usam centro aproximado do bairro com deslocamento determinístico. Essa é uma escolha explícita de privacidade: o mapa é útil para procura regional, não para revelar a posição física do imóvel.

## Filtros, acessibilidade e fluxos essenciais

- O diálogo de filtros abriu com nome acessível `Mais filtros`.
- O foco inicial foi para `Tipo do imóvel`.
- Escape fechou o diálogo e devolveu o foco ao gatilho em 1440, 1280 e 390 px.
- A galeria abriu como diálogo e devolveu o foco a `Abrir foto 1 do imóvel` após Escape.
- Sara abriu a região acessível `Busca assistida pela Sara` e focou `Descreva o imóvel que procura`.
- Anunciar respondeu HTTP 200 em `/proprietario/cadastre-seu-imovel/`, sem exigir login antes da captação, com nome, telefone, e-mail, bairro, tipo e objetivo.
- Portal respondeu HTTP 200 em `/proprietario/` e apresentou os campos de e-mail e senha.
- Não houve submissão de lead, alteração de cadastro ou escrita em ERP/Supabase.
- Console, `pageerror` e respostas críticas ficaram sem erros nas três larguras.

Dados estruturados da execução: [`pos-producao/auditoria-navegador.json`](pos-producao/auditoria-navegador.json).

## Privacidade no HTML, JSON-LD e rede

### HTML e JSON-LD

Duas fichas distintas foram buscadas por HTTP direto, antes do JavaScript:

- `imovel-45dfa57e…`: HTTP 200, `text/html`, 33 m²;
- `imovel-5f369d0b…`: HTTP 200, `text/html`, 42 m², metadados distintos;
- slug inexistente: HTTP 404, `noindex,nofollow`.

Nas duas fichas, o `PostalAddress` contém somente `addressLocality: São Paulo`, `addressRegion: SP` e `addressCountry: BR`. Não existe `streetAddress`, `geo`, latitude ou longitude. `Rua Domingos Lopes` não apareceu no HTML, metas, JSON-LD ou DOM.

O endereço corporativo do rodapé é deliberadamente separado e não é endereço de imóvel.

### Respostas de rede

Foram inspecionadas 11 respostas do catálogo público por viewport, todas HTTP 200. A consulta principal usa allowlist explícita:

`id, slug, bairro, status, entrega, area_util, dormitorios, suites, banheiros, vagas, preco, condominio_valor, destaque, ordem, lazer, diferenciais, finalidade, iptu, capa_path, fotos, unidades_disponiveis, preco_min, preco_max, area_min_disponivel, area_max_disponivel, dormitorios_min_disponiveis, dormitorios_max_disponiveis, vagas_min_disponiveis, vagas_max_disponiveis, tipologias_disponiveis, tour_url, cidade, uf, codigo, unidades_site`.

Não são solicitados `endereco`, `logradouro`, complemento, latitude, longitude, texto livre de endereço ou coordenadas. O único campo interno chamado `numero` encontrado na recursão está dentro de `unidades_site` e identifica a unidade comercial exibida no catálogo; não é número de logradouro e não vem acompanhado de rua/complemento/geo. Nenhum valor `Rua Domingos Lopes` apareceu nas respostas.

Conclusão de privacidade: **aprovada para endereço imobiliário**. Rótulos de ruas visíveis nas imagens do OpenStreetMap pertencem ao mapa-base público e não identificam qual rua ou ponto corresponde a um imóvel.

## HTTP e SEO

- home: 200, `text/html; charset=utf-8`, canonical/OG/Twitter factuais;
- duas fichas: 200, HTML inicial específico e metadados distintos;
- slug inexistente: 404, canonical neutro e `noindex,nofollow`;
- JavaScript, CSS/HTML do bundle, WebP e analytics críticos: todos 200;
- nenhum asset crítico 404 e nenhum 5xx observado.

Prova completa: [`pos-producao/http-seo-producao.json`](pos-producao/http-seo-producao.json).

## Performance pós-produção

### Três amostras HTTP

Medição a partir desta máquina, sem confundir com dados de campo:

| Rodada | Home TTFB / total | Ficha TTFB / total |
|---:|---:|---:|
| 1, fria | 347,5 / 351,0 ms | 19,2 / 20,6 ms |
| 2 | 20,5 / 21,1 ms | 18,5 / 19,0 ms |
| 3 | 23,0 / 23,9 ms | 18,5 / 19,1 ms |

A primeira home registra o custo frio observado; as repetições aquecidas não o ocultam.

### Três medições de laboratório no Chrome

| Viewport | LCP | CLS | Long tasks |
|---|---:|---:|---:|
| 1440×900 | 1.324 ms | 0,0080 | 1, máximo 100 ms |
| 1280×800 | 676 ms | 0,0030 | nenhuma |
| 390×844 | 1.072 ms | 0 | nenhuma |

São medições de laboratório em uma execução por viewport, não Core Web Vitals de campo. O **INP é indisponível**: não houve amostra válida de usuários reais nem volume de eventos suficiente para declará-lo.

### Galeria: três rodadas fria/aquecida

| Rodada | Abertura fria | Três trocas após preload |
|---:|---:|---:|
| 1 | 278,3 ms | 74,2 / 100,5 / 42,2 ms |
| 2 | 319,8 ms | 53,3 / 38,9 / 63,2 ms |
| 3 | 334,6 ms | 107,1 / 92,2 / 59,8 ms |

As nove trocas aquecidas ficaram abaixo de 108 ms e do gate de 200 ms. A abertura fria ficou entre 278 e 335 ms. Evidência: [`pos-producao/benchmark-galeria.json`](pos-producao/benchmark-galeria.json).

## Nota ponderada de produção

Pesos definidos no aceite final:

| Área | Peso | Nota | Evidência e limite |
|---|---:|---:|---|
| Busca e mapa | 25% | 8,8 | 19/19 representados, split desktop e toggle mobile; localização deliberadamente aproximada |
| Ficha, galeria e mídia | 25% | 8,7 | mosaico 1+4 único, capa interior e trocas aquecidas <108 ms; curadoria integral depende de Produtos |
| Hierarquia visual | 20% | 8,5 | home, busca e ficha consistentes nas três larguras; benchmark não foi copiado |
| Fluidez | 10% | 8,6 | LCP lab 0,676–1,324 s, CLS 0–0,008; INP de campo ausente |
| Mobile e acessibilidade | 10% | 8,8 | 390×844 sem overflow, bottom sheet, foco e galeria comprovados |
| Privacidade e confiança | 10% | 9,4 | HTML/JSON-LD/rede sem endereço ou geo exato; mapa regional e aviso explícito |
| **Total ponderado** | **100%** | **8,76/10** | `2,20 + 2,175 + 1,70 + 0,86 + 0,88 + 0,94` |

Essa é uma nota de produção, não a antiga nota técnica de preview. Ela não é arredondada para 9 ou 10.

## Lacunas reais para 10/10

1. **Web Vitals de campo:** ainda não há amostra suficiente de LCP/CLS/INP de usuários reais; INP permanece não comprovado.
2. **Curadoria de mídia:** a ficha auditada tem cinco ativos únicos e capa interior, mas seleção semântica/focal point de todo o catálogo ainda depende de metadados de Produtos.
3. **Mapa:** a localização aproximada protege privacidade e representa 19/19, porém não substitui um futuro contrato público e seguro de localização por região aprovado no ERP.
4. **Cobertura de conteúdo:** o build publica 124 páginas, mas a excelência editorial de todas as descrições e todas as capas não foi inferida a partir das duas fichas testadas.
5. **Desempenho frio:** a home teve uma amostra fria de 351 ms no transporte e a galeria abriu fria em até 334,6 ms; ambos são bons, mas ainda devem ser acompanhados em tráfego real.

## Conclusão binária

**PRODUÇÃO APROVADA PARA O ESCOPO PUBLICADO.**

O merge `1d42c4f…` está live no deploy `dep-da956i9f2nfc73easam0`; home, busca, mapa, filtros, ficha, galeria, Sara, Anunciar, Portal, HTTP, SEO, assets, console, rede e privacidade passaram no ambiente real. Nenhuma regressão objetiva foi reproduzida e, portanto, nenhum rollback nem mudança de código foi executado nesta auditoria.
