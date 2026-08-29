# Medições de fluidez — build local do Draft PR #34

Data: 28/08/2026. Ambiente de laboratório: Chrome headless, viewport 1280×800, build servido em `127.0.0.1:4173`. Não são dados de campo nem Core Web Vitals.

Cada fluxo foi executado três vezes. Um `PerformanceObserver` registrou entradas `longtask`; um loop de `requestAnimationFrame` registrou o maior intervalo entre frames. Os tempos totais incluem as esperas deliberadas da automação para observar a interface, por isso não representam latência pura do clique.

| Fluxo | Execução | Total observado | Maior intervalo de frame | Intervalos >50 ms | Long tasks | Duração total / máxima |
|---|---:|---:|---:|---:|---:|---:|
| Scroll 720 px e retorno | 1 | 1.117,1 ms | 17,6 ms | 0 | 0 | 0 / 0 ms |
| Scroll 720 px e retorno | 2 | 1.119,9 ms | 66,9 ms | 1 | 1 | 63 / 63 ms |
| Scroll 720 px e retorno | 3 | 1.114,4 ms | 17,4 ms | 0 | 0 | 0 / 0 ms |
| Abrir e fechar filtros | 1 | 404,3 ms | 33,4 ms | 0 | 0 | 0 / 0 ms |
| Abrir e fechar filtros | 2 | 357,9 ms | 17,6 ms | 0 | 0 | 0 / 0 ms |
| Abrir e fechar filtros | 3 | 323,6 ms | 16,9 ms | 0 | 0 | 0 / 0 ms |
| Próxima foto na galeria | 1 | 708,8 ms | 300,1 ms | 1 | 0 | 0 / 0 ms |
| Próxima foto na galeria | 2 | 716,7 ms | 17,7 ms | 0 | 0 | 0 / 0 ms |
| Próxima foto na galeria | 3 | 717,9 ms | 17,6 ms | 0 | 0 | 0 / 0 ms |

Leitura honesta:

- filtros: três execuções sem long task ou intervalo acima de 50 ms;
- scroll: duas execuções limpas; uma long task de 63 ms, ainda reproduzível como ressalva de laboratório;
- galeria: nenhuma long task; a primeira troca teve intervalo de frame de 300,1 ms durante o primeiro carregamento/decodificação, enquanto as duas seguintes ficaram abaixo de 18 ms. O índice e o estado de loading mudaram imediatamente, sem bloquear o clique;
- console: nenhum erro JavaScript;
- rede: beacons do Google e preloads de fotos adjacentes foram abortados ao encerrar/navegar rapidamente no teste. Não houve 4xx/5xx do documento ou dos assets locais.

Essa evidência comprova melhora e estabilidade após aquecimento, mas não autoriza chamar a experiência de 10/10 nem substitui medição de campo.
