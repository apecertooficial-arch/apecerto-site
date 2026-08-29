# Design brief — reconstrução UX premium do Site ApêCerto

Data: 29/08/2026  
Base de comparação: produção ApêCerto em 1440×900, Airbnb Brasil e QuintoAndar atuais em home e busca.  
Nota-base de aceite: 3,2/10. CI verde e PR anterior não são evidência de qualidade visual.

## Diagnóstico visual da produção

1. A busca remove o mapa quando nenhum imóvel possui coordenada pública, quebrando o principal modelo mental de procura imobiliária.
2. Hero, filtros e CTAs usam volumes, raios e sombras grandes demais; a densidade é inferior aos benchmarks e reduz o inventário visível na primeira dobra.
3. A ficha usa H1 e espaçamentos de landing page em uma tela de produto; resumo, preço e ação não formam uma hierarquia única.
4. O mosaico repete a capa quando faltam posições distintas, mesmo quando a hidratação posterior possui alternativas.
5. O endereço expõe logradouro na UI e no JSON-LD. A consulta detalhada usa `select=*`, permitindo também rua e coordenada exata na resposta de rede.
6. Cards não funcionam como uma superfície clicável inequívoca e as primeiras capas podem repetir visualmente.
7. No mobile, filtros e alternância mapa/lista ocupam muito espaço e não se comportam como um bottom sheet de produto.

## Padrões extraídos dos benchmarks — sem copiar identidade

| Fluxo | Airbnb atual | QuintoAndar atual | Princípio adotado pela ApêCerto |
|---|---|---|---|
| Navegação | Barra simples, busca central e ações secundárias discretas | Navegação curta, filtros logo abaixo e entrada isolada | Header de 64–72 px, três grupos claros e ações sem pills exageradas |
| Home | Busca imediatamente acionável e inventário visual logo abaixo | Hero objetivo com formulário compacto e proposta clara | Hero mais baixo, busca acima da dobra e resultados/mapa antes do editorial |
| Busca | Filtros essenciais horizontais, cards densos e mapa lado a lado | Lista + mapa 50/50, filtros sticky e contadores legíveis | Split view sticky no desktop, lista/mapa alternáveis no mobile, controles de 40–44 px |
| Cards | Imagem domina, metadados curtos, card inteiro interativo | Preço e atributos escaneáveis, pouca ornamentação | Proporção 4:3, hierarquia curta, hover/focus e clique na superfície inteira |
| Filtros | Chips essenciais e modal para refinamento | Barra sticky e filtros progressivos | Filtros compactos; bottom sheet acessível no mobile; URL sempre preservada |
| Ficha | Galeria grande, detalhes abaixo e CTA persistente | Mosaico editorial, preço/conversão lateral | Mosaico 1+4 com fotos únicas, resumo em grid e CTA sticky discreto |
| Galeria | Navegação por setas/swipe e feedback imediato | Sequência fotográfica contínua | Miniaturas, deduplicação, preload anterior/próxima e skeleton curto |
| Mobile | Alternância clara e controles de toque | Busca/mapa priorizados, ações fixas | Bottom sheet de filtros, mapa/lista sempre acessíveis e alvos de 44–48 px |

## Decisões de produto e privacidade

- O mapa nunca usa ou publica endereço completo ou coordenada de origem.
- Cada resultado recebe somente o centro público aproximado do bairro/região e um deslocamento determinístico estável por ID. O mapa e a ficha exibem “localização aproximada”.
- A UI, metadados de imóvel, JSON-LD, bundle e requests do catálogo solicitam somente campos explicitamente permitidos. Rua, número, complemento, latitude e longitude ficam fora.
- O endereço corporativo do rodapé permanece: ele identifica a empresa, não o imóvel.
- Quando houver informação ampla factual, a ficha usa somente bairro e cidade; não inventa “próximo a”.
- A capa prioriza a primeira mídia privativa válida; a galeria remove URLs repetidas antes de montar o mosaico.

## Sistema visual alvo

- Laranja oficial único: `--ape-orange-brand` / `--ape-orange` = `#FF7000`; variações apenas para contraste/estado.
- Bordas de 1 px, raios entre 8 e 16 px nas superfícies, elevação `xs/sm` e uma única camada sticky.
- Botões entre 40 e 48 px; pills apenas em chips, badges e controles compactos.
- H1 da ficha com `clamp(30px, 3vw, 44px)`; títulos de resultado entre 24 e 32 px.
- Grid de 4/8 px; conteúdo principal com largura útil maior e menos vazios verticais.

## Arquivos-alvo

- `design/Site ApeCerto.dc.html`: layout, CSS, mapa aproximado, cards, ficha, galeria e requests públicos.
- `scripts/prerender-properties.mjs`: remoção defensiva de rua/coordenadas nos metadados pré-renderizados.
- `tests/site.test.mjs`: regressões de mapa aproximado, privacidade, mídia, responsividade e interação.
- `tests/site-seo.test.mjs` e `tests/prerender-properties.test.mjs`: JSON-LD sem `streetAddress` e ausência de dados privados.
- `scripts/verifica-design.mjs`: gate de bundle/artefato sem campos privados de imóvel.

## Plano de implementação verificável

1. Criar contrato de campos públicos explícitos e sanitizar todos os registros imediatamente após o fetch.
2. Substituir ausência de coordenadas por centros públicos de bairro e jitter determinístico, marcados como aproximação.
3. Tornar split lista/mapa o padrão desktop e alternância Lista/Mapa o padrão mobile, preservando filtros e URL.
4. Aplicar uma camada visual premium compacta sobre hero, filtros, cards e ficha sem remover seções aprovadas.
5. Deduplicar galeria, priorizar mídia privativa, impedir repetição do mosaico e preaquecer anterior/próxima.
6. Remover rua de UI, HTML, JSON-LD, metadados e respostas solicitadas pelo frontend.
7. Rodar testes/build/smokes, medir cold/warm gallery e Web Vitals de laboratório nas três larguras.
8. Abrir Draft PR, validar preview lado a lado e só publicar se todos os itens críticos atingirem pelo menos 8/10.

## Rollback

Antes de qualquer publicação, registrar novamente commit, versão e deploy estáveis. Em regressão de busca/mapa, ficha/galeria, privacidade, assets, 5xx, SEO ou desempenho acima do limite, restaurar o deploy estável e revalidar.
