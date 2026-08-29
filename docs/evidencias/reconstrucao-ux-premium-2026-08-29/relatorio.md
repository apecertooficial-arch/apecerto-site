# Evidências — reconstrução UX premium do Site ApêCerto

Data: 29/08/2026  
Base: `origin/main` em `05a51d4e2c1ed53d79075d275eaefef4757dfaf1`  
Branch: `codex/reconstrucao-ux-premium-20260829`  
Status deste documento: validação local; preview e produção ainda não comprovados.

## Resultado local

A nota-base de experiência de 3,2/10 foi aceita como diagnóstico da produção anterior. A reconstrução local recupera o mapa, reduz o peso visual, reorganiza a busca, transforma a ficha em uma tela de produto e elimina dados privados do imóvel do contrato público. CI ou teste unitário isolado não foi usado como substituto da revisão visual.

## Comparação visual

| Fluxo | Antes/benchmark | Depois na mesma largura |
|---|---|---|
| Home 1440×900 | `../ux-real-2026-08-28/producao-1440x900.png`, `../ux-real-2026-08-28/benchmark-airbnb-1440x900.png`, `../ux-real-2026-08-28/benchmark-quintoandar-1440x900.png` | `depois-home-1440x900.png` |
| Home 1280×800 | `../ux-real-2026-08-28/producao-1280x800.png` | `depois-home-1280x800.png` |
| Home mobile 390×844 | `../ux-real-2026-08-28/producao-390x844.png`, `../ux-real-2026-08-28/benchmark-airbnb-390x844.png`, `../ux-real-2026-08-28/benchmark-quintoandar-390x844.png` | `depois-home-390x844.png` |
| Busca + mapa | produção não apresentava o mapa no aceite | `depois-mapa-1440x900.png`, `depois-mapa-390x844.png` |
| Filtros mobile | modal pesado/fluxo inconsistente | `depois-filtros-390x844.png` |
| Ficha e galeria | H1 desproporcional e mosaico repetido | `depois-ficha-390x844.png`, `depois-galeria-1280x800.png` |

Os princípios extraídos dos benchmarks — densidade, busca progressiva, lista/mapa, ficha com conversão lateral e galeria editorial — estão registrados no design brief. A identidade, o texto e os componentes não foram copiados.

## Critérios críticos comprovados localmente

- Busca desktop em lista/mapa dividido, com controles compactos e sticky.
- Mobile com alternância Lista/Mapa e filtros em bottom sheet; o diálogo recebe foco, fecha por botão/Escape e devolve o foco ao gatilho.
- Os 71 resultados são representados por centros aproximados de bairro com deslocamento determinístico. Pontos próximos são agrupados sem remover ofertas do popup.
- O aviso de localização aproximada fica integralmente legível também sob os controles sticky no mobile.
- O frontend ignora latitude/longitude da origem e não geocodifica endereço.
- O catálogo e o detalhe solicitam allowlist explícita. Rua, número, complemento, latitude, longitude, nome livre e descrição livre não fazem parte das respostas pedidas pelo navegador.
- UI e JSON-LD do imóvel publicam bairro/cidade; o endereço corporativo do rodapé permanece separado e permitido.
- Galeria 1+4 usa URLs únicas, prioriza alternativa de interior, pré-carrega anterior/próxima e não replica a fachada para preencher posições.
- Cards têm 4:3, skeleton/fallback, clique na superfície e estados hover/focus; as primeiras ofertas evitam repetir a mesma capa quando existe alternativa real.
- Anunciar continua iniciando pela captação; Sara e Portal permanecem funcionais.
- Nenhum overflow horizontal em 1280 ou 390 px nas medições de navegador.

## Performance de laboratório local

Medição em Chrome real local, três rodadas. Não são Core Web Vitals de campo.

| Métrica | Faixa observada | Última rodada comparável |
|---|---:|---:|
| LCP home desktop | 152–372 ms | 152 ms |
| CLS home desktop | 0,002995 | 0,002995 |
| Long tasks desktop | 0–1; máximo 131 ms | nenhuma |
| LCP home mobile | 100–120 ms | 108 ms |
| CLS mobile | 0 | 0 |
| Long tasks mobile | 0 | nenhuma |
| Galeria, abertura fria | 19,3–24,5 ms | 24,5 ms |
| Galeria, três trocas aquecidas | 9–14,2 ms | 14,2 / 12,2 / 9 ms |

O INP não pode ser declarado com validade de campo nesta execução. A observação de eventos não capturou uma amostra representativa; a latência percebida da galeria foi medida diretamente do clique até a imagem completa.

## Gates técnicos

- Build e verificador bloqueante: aprovados; pacote local final `105aa4dba1bbe75b` antes do commit.
- Suíte completa no estado final: 125/125 testes verdes.
- Regressão direcionada do mapa/privacidade/galeria: 54/54 testes verdes antes da repetição integral.
- Smoke HTTP: 6 rotas ativas + 1 desativada, orçamento inicial medido em 381.094 bytes, sem rota quebrada.
- Smoke SEO: duas fichas distintas e uma rota 404/noindex aprovadas.
- Segurança: nenhum segredo administrativo foi adicionado ao frontend.

## Nota ponderada local — não é nota de produção

| Área | Peso | Nota local |
|---|---:|---:|
| Busca e mapa | 25% | 8,6 |
| Ficha, galeria e mídia | 25% | 8,4 |
| Hierarquia visual | 20% | 8,3 |
| Fluidez | 10% | 8,2 |
| Mobile e acessibilidade | 10% | 8,5 |
| Privacidade e confiança | 10% | 9,0 |
| **Total ponderado** | **100%** | **8,48/10** |

Nenhum item crítico local ficou abaixo de 8. A nota não é arredondada para 9 e não autoriza, sozinha, produção.

## Riscos e limites honestos

1. O catálogo atual não oferece classificação semântica/focal point consistente para todas as fotos. O Site usa deduplicação e uma heurística conservadora; a curadoria perfeita de capa depende de um contrato futuro de Produtos, fora desta mudança.
2. Centros de bairro são deliberadamente aproximados. Eles melhoram a procura e preservam a privacidade, mas não representam a posição física exata.
3. Preview real do Render ainda é o gate obrigatório para assets, cache, mapa/tiles, métricas de rede e comportamento da hospedagem.
4. Produção deve permanecer no deploy estável até que preview, CI e smoke do SHA aprovado estejam verdes.

## Gate de release

Somente avançar para Ready/merge/deploy quando o Draft PR servir exatamente o SHA aprovado no preview e repetir: HTTP/SEO, 1440×900, 1280×800, 390×844, lista/mapa, filtros, ficha, galeria, console/rede e privacidade. Em 5xx, asset quebrado, mapa ausente, rua/coordenada privada, regressão de navegação ou desempenho relevante, cancelar a publicação ou executar rollback imediato para o commit/deploy estável registrado antes do release.
