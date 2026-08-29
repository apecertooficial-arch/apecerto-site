# Auditoria e correção da experiência real — 28/08/2026

## Conclusão

A nota anterior de 9,6/10 não representa a experiência percebida. A linha de base real foi **6,1/10**. Após a segunda revisão visual, esta branch leva a avaliação local para **8,445/10**, sem declarar o site pronto em produção: mapa completo, seleção editorial das capas, foco de corte e variantes responsivas ainda dependem do contrato de Produtos/backend.

Base usada: `origin/main` em `255a7558cd49138f5126c5e343115fb6fe254f66`. Nenhum merge ou deploy foi feito.

## Evidência reproduzida antes da correção

- Ficha: 4.212 ms até o conteúdo visível no primeiro acesso medido em produção.
- Galeria: 3.151 ms para abrir e 3.157 ms até a URL da próxima foto mudar.
- Home mobile 390×844: título, texto e formulário ocupavam quase toda a primeira tela; os cards ficavam abaixo da dobra.
- Mapa: 71 resultados, 0 pontos válidos; a tela de mapa ficava vazia porque o catálogo público não entrega coordenadas para nenhum imóvel.
- Bairros: seis nomes editoriais fixos eram exibidos mesmo sem correspondência no catálogo.
- Anunciar: a rota começava pela criação/login, antes da captação.
- Capas: na amostra das seis primeiras, duas eram verticais (1300×1920 e 715×1080) recortadas em 282×190. Todas vinham pelo endpoint seguro `site-media`, sem `srcset`/`sizes`; não há foco editorial público para orientar o corte.
- Tokens computados em produção: laranja `#FF7000` e roxo `#8B00CC`, iguais aos tokens do fonte oficial. O ZIP citado não estava mais disponível no caminho informado; a comparação foi feita contra os tokens versionados no próprio Design System do site. A divergência percebida vinha principalmente de escala, superfícies, sombra e contraste — não foi criada paleta paralela.

Evidências: [produção 1280×800](evidencias/ux-real-2026-08-28/producao-1280x800.png), [produção 390×844](evidencias/ux-real-2026-08-28/producao-390x844.png).

## Benchmark atual

Foram avaliados Airbnb e QuintoAndar em desktop e 390×844. Os princípios aplicados, sem copiar identidade, foram:

- menos controles na busca inicial e divulgação progressiva dos avançados;
- título e formulário com uma prioridade clara;
- primeiro retorno visual imediato ao navegar em fotos;
- anúncio como jornada distinta da conta;
- mapa com estado vazio explícito, nunca um canvas aparentemente quebrado;
- densidade mobile suficiente para revelar o começo do catálogo na primeira tela.

Evidências: [QuintoAndar desktop](evidencias/ux-real-2026-08-28/benchmark-quintoandar-1440x900.png), [QuintoAndar mobile](evidencias/ux-real-2026-08-28/benchmark-quintoandar-390x844.png), [Airbnb desktop](evidencias/ux-real-2026-08-28/benchmark-airbnb-1440x900.png), [Airbnb mobile](evidencias/ux-real-2026-08-28/benchmark-airbnb-390x844.png).

## O que foi corrigido localmente

1. **Hero e busca:** redução de escala, altura, espaços e sombra; apenas bairro e status ficam na busca inicial. Dormitórios, vagas, preço e demais critérios continuam disponíveis no drawer “Mais filtros”.
2. **Galeria:** o índice e o loading mudam antes de qualquer espera de rede. A foto seguinte/anterior é preparada em segundo plano, sem baixar o álbum inteiro.
3. **Mapa:** quando não há coordenadas válidas, a interface mostra causa e caminho de volta à lista. Se coordenadas válidas voltarem ao feed, Leaflet, bounds, agrupamento e marcadores continuam ativos.
4. **Bairros:** nomes e contagens agora são derivados somente dos imóveis publicados. Na amostra real: Moema 63, Campo Belo 6, São Judas 1 e Vila Guarani 1.
5. **Anunciar:** abre o wizard de captação. Conta/login só é solicitado no envio, preservando os dados preenchidos na sessão e sem abrir escrita anônima ou alterar RLS.
6. **Design System:** cores oficiais mantidas; borda sutil e sombra menor substituem o cartão pesado.
7. **Dobra e ritmo:** o espaço combinado depois do hero foi reduzido; “Em destaque” entra na dobra em 1280×800 e aparece integralmente em 1440×900.
8. **Arquitetura do cabeçalho:** Comprar e Anunciar imóvel formam a navegação principal; Minha conta e Agendar visita são ações separadas e hierarquizadas. O fluxo Anunciar continua abrindo a captação antes da conta.
9. **Mobile:** CTA curto e em uma linha, placeholders “Bairro” e “Status” sem truncamento e alvos de toque de pelo menos 44 px.
10. **Controles dos resultados:** a antiga faixa horizontal cortada foi substituída por grade explícita no celular; favoritos, filtros, ordenação e Lista/Mapa ficam todos visíveis e acessíveis.
11. **Capas com os ativos reais:** proporção 4:3, corte central previsível, skeleton durante carregamento e fallback “Foto em preparação” em ausência/erro. Nenhuma foto ou dado comercial foi inventado.

Depois final: [home 1440×900](evidencias/ux-real-2026-08-28/depois-final-1440x900.png), [home 1280×800](evidencias/ux-real-2026-08-28/depois-final-1280x800.png), [home mobile](evidencias/ux-real-2026-08-28/depois-final-390x844.png), [galeria](evidencias/ux-real-2026-08-28/depois-galeria-1280x800.png), [mapa sem coordenadas](evidencias/ux-real-2026-08-28/depois-mapa-sem-coordenadas-1280x800.png), [captação antes da conta](evidencias/ux-real-2026-08-28/depois-anunciar-captacao-1280x800.png).

## Resultados medidos no build local

- abertura da galeria: **329 ms**;
- clique em próxima foto até mudança do `src`: **404 ms**, com loading visível imediatamente;
- drawer de filtros mobile: **647 ms** incluindo automação e estabilização do navegador;
- overflow horizontal em 390×844: **0 px**;
- segunda bateria de fluidez, em três execuções por fluxo: filtros sem long tasks; scroll com 0/1/0 long tasks (máxima 63 ms); galeria com 0/0/0 long tasks. A primeira foto teve um intervalo de frame de 300,1 ms durante carregamento/decodificação e as duas seguintes ficaram em 17,7/17,6 ms;
- build: 30.342 bytes de HTML bruto / 11.047 bytes gzip; orçamento inicial 378.739 bytes;
- testes: **122/122 verdes**;
- verificador bloqueante: aprovado;
- smoke HTTP: 6 rotas ativas e 1 desativada, aprovado;
- smoke SEO: duas fichas distintas e uma rota 404/noindex, aprovado.

A instrumentação de laboratório e a metodologia estão registradas em [medições de fluidez](evidencias/ux-real-2026-08-28/medicoes-fluidez.md). LCP/CLS/INP de campo não foram inventados e continuam dependendo de observação real após preview/deploy autorizado.

## Nota real por área

| Área | Antes | Local | Justificativa |
|---|---:|---:|---|
| Marca e sofisticação | 6,0 | 8,7 | hierarquia de navegação e superfícies aderentes aos tokens |
| Home desktop | 6,3 | 8,9 | hero compacto; seção seguinte comprovada na dobra 1280/1440 |
| Home mobile | 5,2 | 8,8 | CTA e selects legíveis, catálogo cedo e controles sem corte |
| Fluidez percebida | 5,0 | 8,6 | feedback imediato e 8 de 9 execuções sem long task; uma long task de 63 ms |
| Busca e filtros | 6,4 | 8,8 | principais visíveis, avançados no drawer, URL e foco preservados |
| Lista e mapa | 3,5 | 6,8 | vazio deixou de parecer defeito; pontos reais ainda ausentes |
| Cards e capas | 5,5 | 7,8 | 4:3, skeleton e fallback; seleção/foco/variantes ainda dependem de Produtos |
| Ficha e galeria | 6,0 | 8,8 | navegação imediata, prefetch adjacente, foco/swipe preservados |
| Bairros | 4,0 | 9,0 | somente fonte real, nomes e contagens verdadeiros |
| Fluxo Anunciar | 4,5 | 8,5 | captação antes de conta; escrita continua autenticada |
| Acessibilidade | 7,8 | 8,6 | status live, controles completos, trap e devolução de foco preservados |
| Desempenho | 7,0 | 8,0 | interação medida; primeiro decode e variantes de mídia ainda pendentes |
| SEO e segurança | 9,0 | 9,0 | sem regressão, nenhum segredo ou RLS alterado |

Pesos: 10% para cada uma das oito primeiras áreas; 5% para Bairros, Anunciar e Acessibilidade; 3% para Desempenho; 2% para SEO e segurança. Cálculo sem arredondamento: `0,87 + 0,89 + 0,88 + 0,86 + 0,88 + 0,68 + 0,78 + 0,88 + 0,45 + 0,425 + 0,43 + 0,24 + 0,18 = 8,445`.

**Nota geral ponderada local: 8,445/10.** O teto continua abaixo de 9 enquanto o mapa completo e a curadoria das capas permanecerem bloqueados pelo contrato de Produtos.

## Dependências externas que impedem 10/10

- Produtos/backend: fornecer localização pública segura (não endereço exato) para os imóveis elegíveis, de forma que cada imóvel com coordenada válida volte ao mapa. **Sem esse contrato, o mapa completo não pode ser fabricado pelo Site.**
- Produtos: campo explícito de foto principal e foco de corte por imóvel; rejeição/alerta para capa vertical, escura, duplicada ou de baixa resolução. **Sem esse contrato, a curadoria real das capas continua bloqueada; o Site só pode apresentar melhor os ativos existentes.**
- `site-media`: variantes por largura/formato e cache para `srcset` sem expor path privado.
- Preview Render: medir LCP/CLS/TBT em três execuções desktop/mobile e validar console/rede reais.
