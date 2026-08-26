# Auditoria UX — ApêCerto x QuintoAndar

**Data:** 26/08/2026  
**Sites avaliados:** [apecerto.com](https://apecerto.com/) e busca pública do [QuintoAndar](https://www.quintoandar.com.br/)  
**Escopo:** primeira impressão, busca, filtros, cards, fotos, mapa, ficha do imóvel, conversão, identidade visual, celular, desempenho e acessibilidade.

## Veredito executivo

Hoje a ApêCerto é uma base tecnicamente boa, mas ainda não é uma experiência de procura de imóveis no nível do QuintoAndar.

**Nota geral da ApêCerto em relação ao benchmark: 6,2/10.**

## Resultado da execução — 26/08/2026

O P0 foi implementado e validado localmente, sem publicação automática nesta rodada:

- identidade restaurada para `#FF7000` e `#8B00CC`, com token separado para contraste;
- compra permanece disponível e aluguel só aparece quando a vitrine pública tiver oferta real;
- cards usam títulos comerciais, escondem atributos zerados e não exibem código interno;
- setas só aparecem com pelo menos duas fotos reais e a espera máxima da troca caiu de 900 ms para 350 ms;
- ordenação por relevância, menor preço, maior preço e maior área;
- no celular, hero reduzido, imagem/estatísticas editoriais removidas da primeira tela, `Dividida` removida, alvos de toque com 44 px e barra horizontal de filtros/ordenação/modo;
- ficha com título comercial e custo mensal estimado quando condomínio ou IPTU estiverem cadastrados;
- mapa móvel validado com 50 marcadores agrupando 71 unidades carregadas, mantendo lista e mapa sobre o mesmo catálogo.

**Verificações da rodada:** build selado; 87 testes automatizados aprovados; smoke HTTP das 6 rotas aprovado; desktop e celular 390 × 844 testados em navegador real; zero erro de console.

As mudanças elevam a experiência estimada para **7,8/10 em relação ao benchmark**, antes de uma nova auditoria completa pós-publicação. Permanecem para as próximas entregas: página exclusiva de resultados, drawer de filtros avançados, “buscar nesta área”, sincronização visual card/marcador, rota de detalhe sem a home montada, CTA móvel persistente, swipe, curadoria editorial automática das fotos e regras de qualidade obrigatórias no ERP.

O site não é ruim. Ele tem diferenciais valiosos — curadoria local, boa galeria completa, integração com o catálogo, financiamento e contato —, porém tenta ser landing page, catálogo, mapa e institucional ao mesmo tempo. O QuintoAndar trata a busca como o produto principal. Essa diferença de prioridade explica grande parte da sensação de que o site da ApêCerto “não faz o cliente clicar”.

O maior problema não é velocidade técnica. A auditoria anterior registrou Lighthouse móvel entre 91 e 95 e computador em 100. O maior problema atual é **hierarquia comercial, qualidade dos dados/fotos e fluidez do funil de busca**.

## Notas por área

| Área | ApêCerto | QuintoAndar como referência | Diagnóstico |
| --- | ---: | ---: | --- |
| Identidade visual | 5,0 | 9,0 | O laranja principal foi escurecido e perdeu a aparência original da marca. |
| Entrada e clareza da busca | 6,0 | 9,0 | A ApêCerto mistura manifesto, formulário, foto e estatísticas; o benchmark leva direto à procura. |
| Filtros | 4,8 | 9,2 | Há poucos critérios e a opção de aluguel abre uma vitrine vazia. |
| Cards e comparação de imóveis | 5,5 | 9,0 | Os cards têm boa base, mas códigos, zeros e títulos genéricos ocupam espaço comercial. |
| Fotos e carrossel | 6,0 | 8,8 | A troca funciona em imóveis com várias fotos, mas há controles em cards sem avanço e capas pouco vendedoras. |
| Mapa | 6,2 | 9,2 | Agrupa unidades e enquadra Moema, porém tem menos interação, sincronização e recursos de busca por área. |
| Ficha do imóvel | 6,8 | 9,3 | A galeria e os detalhes são bons; faltam custo total, informação mais comercial e estrutura de página própria. |
| Celular | 5,4 | 9,0 | O layout responde, mas mantém excesso de conteúdo e controles pensados primeiro para desktop. |
| Conversão e confiança | 6,3 | 9,3 | Há visita, WhatsApp e financiamento, mas o caminho até a decisão é menos claro. |
| Desempenho e estabilidade | 9,2 | 8,5 | A ApêCerto está tecnicamente leve e não apresentou erros no console durante a navegação. |
| Acessibilidade técnica | 8,5 | 8,5 | Lighthouse anterior foi 100, mas ainda há valores e marcadores cuja leitura precisa de contexto melhor. |

## Evidências encontradas no navegador

### 1. A identidade visual realmente mudou

O site publicado usa:

- `--ape-orange-brand: #FF7000` para partes da marca;
- `--ape-orange: #C04E00` para botões e ações;
- `--ape-purple: #8B00CC`.

O laranja original antes da alteração era `#FF7000`. A mudança para `#C04E00` entrou no trabalho de desempenho/qualidade para aumentar contraste com texto branco. O efeito colateral foi transformar o laranja vivo da ApêCerto em um tom mais escuro, próximo de marrom. A percepção do usuário está correta. O roxo-base continua `#8B00CC`, mas aparece pouco e perde força ao lado do novo laranja.

**Correção recomendada:** voltar a usar `#FF7000` como cor principal visual e criar um token separado para situações que exigem contraste. Em botões laranja, usar texto escuro acessível ou reservar o laranja escuro somente para texto pequeno e estados específicos. Não sacrificar acessibilidade nem identidade.

### 2. A home demora para assumir que é uma busca de imóveis

Na ApêCerto, a primeira tela contém:

- título institucional grande;
- texto de posicionamento;
- três finalidades;
- dois selects;
- dormitórios, vagas, Sara e dois controles de preço;
- CTA;
- estatísticas;
- imagem editorial.

No QuintoAndar, a busca já é o produto: localização e filtros ficam numa barra persistente, com resultados e mapa visíveis imediatamente.

**Impacto:** o cliente da ApêCerto precisa interpretar uma landing page antes de começar a comparar imóveis. No celular, o formulário e a imagem empurram os primeiros imóveis para muito abaixo da dobra.

### 3. O fluxo de aluguel está publicado sem catálogo

Ao selecionar `Alugar`, a URL muda para `?finalidade=aluguel`, mas a vitrine mostra “Novos apês chegando”. Mesmo assim, o cabeçalho anuncia “Apês para alugar” e oferece “Ver imóveis para alugar”.

**Impacto:** parece erro ou catálogo quebrado, reduz confiança e cria um caminho sem saída.

**Decisão necessária:** enquanto não houver imóveis de locação, esconder a finalidade e o menu de aluguel ou transformar o caminho em captação de interesse clara, sem fingir que existem resultados.

### 4. Os filtros são insuficientes para uma decisão imobiliária

ApêCerto oferece bairro, status, dormitórios, vagas, preço e busca pela Sara. O benchmark oferece também localização livre, tipo de imóvel, aluguel/valor total, banheiros, área, mobiliado, pets, metrô, disponibilidade, características e desenho de área no mapa.

Além disso, na ApêCerto:

- o bairro é um select fechado, sem busca por rua, metrô ou ponto de interesse;
- o preço usa dois sliders, menos preciso no celular;
- `Comprar`, `Lançamentos` e `Alugar` convivem com `status`, criando sobreposição conceitual;
- não há resumo compacto dos filtros ativos sempre visível;
- não há ordenação por preço, novidade, área ou relevância.

### 5. Os cards têm dados, mas não contam uma história comercial

O card da ApêCerto mostra nome, bairro, código, área, dormitórios, vagas e preço. A estrutura é limpa, mas vários cards exibem `0` para dormitórios ou vagas sem legenda visível. Para um cliente, uma sequência como `AP0104 · 25 m² · 0 · 0` parece erro de cadastro.

Também foram observados títulos como:

- `AP Moema · Un. 1001`;
- `AP Moema · Un. 404`;
- nomes longos com identificação técnica de unidade.

O QuintoAndar usa título descritivo, preço principal e total, área, quartos, vagas e endereço. O código interno não disputa atenção.

**Padrão recomendado para o card:**

1. foto forte;
2. benefício/status curto;
3. título humano, por exemplo `Apartamento mobiliado de 1 dormitório em Moema`;
4. preço e, quando aplicável, condomínio/IPTU/total;
5. área, dormitórios, banheiros e vagas, ocultando atributos sem valor;
6. localização curta;
7. favorito e CTA discreto.

O código do ERP deve continuar disponível na ficha e na busca interna, não como informação comercial principal.

### 6. O carrossel é razoável, mas inconsistente

Em um card com várias fotos, a imagem avançou corretamente. Em outro card, o botão “Próxima foto” estava disponível, mas a imagem não mudou. O benchmark desabilita “Foto anterior” no primeiro quadro e informa `Foto 1 de 12`, deixando o estado claro.

Na ApêCerto, 83 imagens estavam presentes na home e 65 marcadas como lazy load; isso é tecnicamente melhor do que carregar tudo de uma vez. A sensação de lentidão restante vem principalmente de:

- arquivos de origem pouco padronizados;
- imagens que não começam pela melhor foto;
- ausência de feedback visual de carregamento na troca;
- navegação por setas pequenas e pouco natural para toque;
- controles exibidos quando não há outra foto útil.

### 7. O mapa melhorou, mas ainda não funciona como ferramenta de descoberta

No teste filtrado por um dormitório, a ApêCerto informou 49 resultados e renderizou 37 marcadores de empreendimentos agrupados. O enquadramento ficou correto na região atendida. A base atual possui 52 empreendimentos, mas três continuam sem coordenadas válidas; portanto eles não podem aparecer de forma confiável no mapa.

Comparado ao QuintoAndar, faltam:

- sincronizar destaque do card ao passar/clicar no marcador;
- mostrar uma ficha resumida ao selecionar um ponto;
- atualizar resultados de forma evidente ao mover o mapa;
- botão “buscar nesta área”;
- desenhar área de busca;
- alternância celular simples `Lista | Mapa`, em vez de três modos;
- feedback claro quando o marcador representa várias unidades.

Um marcador testado tinha título “AP Moema, 6 unidades disponíveis. Abrir lista”, mas o clique não apresentou um retorno visual claro na tela naquele momento.

### 8. A ficha do imóvel tem boa matéria-prima, mas precisa ser uma página de venda

Pontos fortes da ApêCerto:

- mosaico inicial;
- galeria de 60 fotos com miniaturas e navegação;
- separação de fotos do imóvel e áreas comuns;
- descrição, diferenciais e lazer;
- visita, WhatsApp e financiamento;
- imóveis parecidos.

Pontos que reduzem conversão:

- título genérico `AP Moema · Un. 1001`;
- primeira foto mostra lavanderia/cozinha utilitária, não o melhor ambiente;
- a galeria mistura 34 fotos do imóvel com 26 de áreas comuns sem curadoria de ordem;
- não há custo mensal/total claramente detalhado;
- não informa condomínio, IPTU, andar, posição solar, aceita pets, mobiliário incluído e disponibilidade com o mesmo destaque do benchmark;
- a ficha é aberta como um diálogo sobre a home completa. A home continua montada atrás dela, inclusive com título, cards, mapa e controles. Isso aumenta complexidade, memória e risco de sobreposição, além de não ser uma arquitetura ideal para SEO e navegação;
- “Pedir visita”, financiamento e WhatsApp competem entre si sem um CTA principal persistente.

No QuintoAndar, o topo combina título descritivo, aluguel, total, visita, WhatsApp e fotos; abaixo há características disponíveis/indisponíveis, data de publicação, mapa, análise de preço e similares.

### 9. Celular: o problema é densidade, não só responsividade

O código possui breakpoint em 767 px, empilha hero, filtros, cards e mapa e reduz a galeria. Isso impede o layout de quebrar, mas não transforma a experiência em um produto mobile-first.

Problemas previstos e já observados nas capturas móveis da rodada anterior:

- título + texto + formulário completo + imagem antes dos resultados;
- dois sliders de preço difíceis de ajustar com precisão;
- três modos `Lista`, `Dividida`, `Mapa`, embora “Dividida” não seja adequado a 390 px;
- cards empilhados com muita informação técnica;
- falta de barra fixa com `Filtros` e `Mapa`;
- controles de foto com 36 px, abaixo do alvo tátil de 44 px definido em outras partes do próprio sistema;
- ficha longa, com CTA de conversão sem persistência no rodapé;
- galeria com mosaico antes de uma navegação por gesto simples.

O navegador externo não aplicou a emulação temporária de 390 × 844 nesta rodada. Por isso, a avaliação móvel combina as capturas reais de 390 × 844 da rodada anterior, o breakpoint atual do código, o Lighthouse móvel e os mesmos fluxos inspecionados no desktop. Antes de publicar a reformulação, é obrigatório repetir os cliques em aparelhos reais iOS e Android.

### 10. A base técnica não é o gargalo principal

A navegação da ApêCerto não gerou erros nem avisos no console. A rodada técnica anterior mediu:

- desempenho móvel entre 91 e 95/100;
- acessibilidade, boas práticas e SEO em 100/100;
- desktop em 100/100 nas quatro categorias;
- carga inicial aproximada de 671 KiB no Lighthouse;
- 84 testes automatizados aprovados.

O QuintoAndar carregou muito mais elementos e exibiu diversos avisos de feature flags e falhas de telemetria no console. Ele é a referência de experiência de busca, não de simplicidade técnica. A ApêCerto deve copiar os princípios de produto, não o peso nem a aparência exata do concorrente.

## O que deve mudar primeiro

### P0 — corrigir hoje antes de qualquer redesign amplo

1. **Restaurar a identidade:** voltar o visual principal para `#FF7000` e manter `#8B00CC`; separar cor de marca de cor de contraste.
2. **Retirar o caminho morto de aluguel:** ocultar a opção enquanto o catálogo estiver vazio ou criar uma página honesta de lista de espera.
3. **Limpar os cards:** ocultar valores zero e o código técnico, criar títulos humanos e mostrar somente atributos úteis.
4. **Definir capa e ordem das fotos:** usar sala/varanda/quarto bem iluminado como capa; separar imóvel de áreas comuns.
5. **Reduzir o topo:** fazer a busca caber rapidamente na primeira tela e levar os imóveis para cima.
6. **Celular:** substituir `Lista | Dividida | Mapa` por `Lista | Mapa` e criar barra fixa `Filtros` / `Mapa`.

### P1 — fluxo de busca e mapa

1. Criar uma página própria de resultados, separada da home institucional.
2. Barra fixa com localização, finalidade, preço e filtros ativos.
3. Drawer de filtros com tipo, dormitórios, banheiros, vagas, área, preço, status, mobiliado, pets, metrô e diferenciais.
4. Ordenação por recomendados, menor preço, maior preço, maior área e mais recentes.
5. Sincronizar card e marcador; abrir preview do imóvel no mapa.
6. “Buscar nesta área” após mover o mapa.
7. Garantir coordenadas obrigatórias no ERP antes de publicar.

### P1 — ficha que vende

1. Transformar a ficha em rota/página real e desmontar a home atrás dela.
2. Título comercial gerado a partir dos dados do ERP.
3. Resumo acima da dobra: preço, condomínio, IPTU, total, área, quartos, banheiros, vagas, status e código.
4. CTA principal persistente `Agendar visita`; WhatsApp como alternativa.
5. Ordem editorial de fotos, contador e gesto de swipe no celular.
6. Destaques objetivos: metrô, mobiliado, pet, varanda, lazer, andar e orientação solar.
7. Mapa e pontos de interesse úteis.

### P2 — qualidade do produto no ERP

O site só será 10/10 se os produtos forem 10/10. Antes de aprovar para publicação, o ERP deve exigir:

- título comercial;
- preço válido e finalidade;
- condomínio, IPTU e custo total quando aplicável;
- endereço completo e coordenadas;
- área, dormitórios, banheiros e vagas com `não se aplica` diferente de `zero`;
- capa aprovada;
- mínimo de fotos por ambiente;
- fotos classificadas como `imóvel` ou `área comum` e ordenadas;
- descrição curta comercial e descrição completa;
- status e disponibilidade;
- mobiliado, pets, metrô e diferenciais;
- responsável e data da última revisão.

Criar uma **nota de qualidade do anúncio de 0 a 100** e impedir publicação abaixo de 80, exibindo exatamente o que falta.

## Plano de execução para hoje

### Bloco 1 — 1 a 2 horas: recuperação imediata

- restaurar tokens corretos de marca;
- esconder aluguel vazio;
- ocultar zeros e códigos dos cards;
- reduzir quantidade de conteúdo acima dos resultados;
- testar desktop e celular.

**Aceite:** identidade igual à marca; nenhum caminho vazio; primeiro imóvel visível mais cedo; cards sem dados confusos.

### Bloco 2 — 2 a 4 horas: cards, fotos e celular

- novo card comercial;
- capa baseada em foto aprovada;
- setas somente quando houver próxima foto;
- indicador de carregamento e preload da próxima imagem;
- `Lista | Mapa` no celular e barra fixa de ação.

**Aceite:** foto troca em menos de 300 ms quando pré-carregada; toque mínimo de 44 px; nenhum atributo sem legenda; card compreensível em cinco segundos.

### Bloco 3 — 3 a 5 horas: resultados e mapa

- separar resultados da home;
- barra de filtros persistente;
- ordenação;
- preview de marcador e sincronização com card;
- “buscar nesta área”.

**Aceite:** filtro não recarrega toda a experiência; mapa e lista mostram o mesmo conjunto; selecionar ponto evidencia o imóvel correspondente.

### Bloco 4 — 3 a 5 horas: ficha do imóvel

- rota real sem home montada atrás;
- topo comercial e custo completo;
- CTA persistente;
- galeria por swipe no celular;
- conteúdo estruturado do ERP.

**Aceite:** título e preço entendidos sem rolar; visita disponível em um toque; galeria começa na melhor foto; voltar preserva filtros e posição da lista.

O conjunto completo não cabe com segurança em poucas horas sem risco de quebrar produção. O caminho profissional é publicar P0 hoje, concluir P1 em entregas pequenas e verdes, e iniciar P2 no ERP em paralelo.

## Critérios para chamar o site de 10/10

1. O usuário encontra um imóvel relevante em até três interações.
2. Resultados aparecem na primeira tela da busca, inclusive no celular.
3. Nenhum filtro publicado leva a estado vazio inesperado.
4. Cards não exibem código interno nem valores zero sem contexto.
5. Todas as capas passam por regra editorial ou nota de qualidade.
6. Lista e mapa permanecem sincronizados.
7. A ficha mostra custo completo e dados decisivos acima da dobra.
8. CTA de visita permanece claro sem competir com três ações iguais.
9. Lighthouse móvel fica na faixa verde e acessibilidade/SEO permanecem acima de 95.
10. Core Web Vitals reais, erros, cliques em cards e conversão de visita são acompanhados semanalmente.
11. Testes em iPhone e Android cobrem busca, filtro, carrossel, mapa, ficha e lead.
12. Toda publicação vinda do ERP passa por nota mínima de qualidade.

## Ordem recomendada de decisão

Não copiar o layout do QuintoAndar. Preservar a personalidade da ApêCerto e adotar os princípios que funcionam:

1. busca como produto principal;
2. menos informação técnica e mais decisão;
3. fotos editoradas e rápidas;
4. mapa realmente interativo;
5. ficha transparente;
6. celular como experiência principal;
7. identidade consistente;
8. dados completos desde o ERP.
