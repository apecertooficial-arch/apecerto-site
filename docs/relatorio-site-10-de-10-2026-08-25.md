# Relatório de qualidade do site ApêCerto

**Data da auditoria:** 25/08/2026

**Escopo:** página inicial, catálogo, mapa, galeria, detalhes dos imóveis, navegação, acessibilidade, rastreamento e integração de leitura com o ERP/Supabase.

**Branch de entrega:** `codex/otimizar-performance-site`

## Resultado executivo

O site passou de uma experiência móvel pesada para uma base tecnicamente forte, mantendo o desenho aprovado.

| Auditoria Lighthouse | Antes | Depois |
| --- | ---: | ---: |
| Desempenho no celular | 77/100 | **91/100** |
| Acessibilidade no celular | 96/100 | **100/100** |
| Boas práticas no celular | 100/100 | **100/100** |
| SEO no celular | 100/100 | **100/100** |
| Desempenho no computador | não aferido nesta rodada | **100/100** |
| Acessibilidade no computador | não aferido nesta rodada | **100/100** |
| Boas práticas no computador | não aferido nesta rodada | **100/100** |
| SEO no computador | não aferido nesta rodada | **100/100** |

O resultado é **10/10 no computador** e **9,1/10 em desempenho móvel**, com nota máxima nos outros três pilares móveis. Não é correto prometer 100/100 móvel em qualquer aparelho ou rede, porque o Lighthouse simula um celular limitado e resultados variam. A base atual, porém, está dentro da faixa verde de alta qualidade.

## Métricas finais

### Celular simulado

- Primeira exibição: **1,1 s**.
- Maior elemento visível: **3,5 s**.
- Tempo total de bloqueio: **50 ms**.
- Estabilidade visual: **0**, sem deslocamento de conteúdo.
- Página interativa: **4,2 s**.
- Peso registrado pelo Lighthouse: **671 KiB**.
- Falhas objetivas nas quatro categorias: **nenhuma**.

### Computador

- Primeira exibição: **0,2 s**.
- Maior elemento visível: **0,8 s**.
- Tempo total de bloqueio: **0 ms**.
- Estabilidade visual: **0,002**.
- Página interativa: **0,8 s**.
- Nota: **100/100 nas quatro categorias**.

### Evolução móvel observada

- Desempenho: **77 → 91**.
- Maior elemento visível: **5,6 s → 3,5 s**.
- Tempo de bloqueio: **190 ms → 50 ms**.
- Momento em que a página fica interativa: **10,5 s → 4,2 s**.
- Transferência total da auditoria: **aproximadamente 1,53 MiB → 671 KiB**.
- Carga inicial controlada pelo smoke test: **450.325 B → 368.976 B**.

## O que foi corrigido

### Catálogo conectado ao ERP

- Foi criada uma visão pública enxuta, `site_produtos_catalogo`, somente com os campos necessários para montar catálogo e mapa.
- Dados completos, textos longos e mídia detalhada passam a ser carregados somente quando o visitante abre um imóvel.
- A consulta enxuta ficou cerca de **75% menor** que a consulta completa aferida.
- Foram preservados publicação, preços, códigos, tipos, características, mídia, endereço e contexto do imóvel.
- Um índice específico acelera a seleção da imagem de capa sem abrir permissões extras no banco.

### Fotos e galeria

- O site solicita versões responsivas das imagens, adequadas ao tamanho de tela.
- A próxima foto é preparada em segundo plano, tornando a troca da galeria mais rápida.
- Requisições antigas são canceladas logicamente ao trocar ou fechar o imóvel, evitando que uma resposta atrasada sobrescreva a tela correta.
- A galeria mostra somente nove miniaturas de cada vez e mantém dimensões previsíveis no celular.
- Textos alternativos e anúncio de mudança da foto foram incluídos para leitores de tela.

### Mapa

- O Leaflet e seus recursos deixam de competir com o primeiro carregamento e só entram quando o mapa se aproxima da tela.
- Imóveis do mesmo empreendimento são agrupados em um marcador, que informa quantas unidades existem.
- Todos os empreendimentos com coordenadas válidas são representados.
- Créditos e tamanho do mapa foram corrigidos para celular e computador.

### Fontes, ilustrações e código inicial

- Cinco fontes foram convertidas de TTF para WOFF2, mantendo os mesmos desenhos e reduzindo a transferência.
- A ilustração decorativa principal foi redimensionada sem alteração visual perceptível.
- Recursos essenciais foram preparados antecipadamente; recursos secundários foram adiados.
- O CSS essencial é entregue junto com a página inicial, evitando uma espera extra.
- Controles internos do editor de design não são mais publicados no site.

### Rastreamento

- O gerenciador de tags deixa de bloquear a abertura do site e carrega após interação ou após um intervalo seguro.
- Conversões críticas e consentimento continuam podendo ativá-lo imediatamente.
- Eventos próprios usam envio leve e possuem alternativa com limite de tempo.
- Identificadores de evento, sessão, página e atribuição continuam preservados.
- Nenhuma chave administrativa ou credencial privilegiada foi enviada ao navegador.

### Usabilidade e acessibilidade

- Modais de detalhes, galeria e financiamento agora controlam corretamente o foco do teclado.
- O foco volta para o botão que abriu cada janela ao fechá-la.
- Elementos atrás do modal ficam indisponíveis para navegação assistiva.
- Favoritos, menu, navegação e estados de sucesso possuem nomes e comportamento acessíveis.
- O WhatsApp flutuante não cobre modais abertos.
- Animações respeitam a preferência de movimento reduzido do usuário.

## Banco de dados e mapa: situação real

O catálogo atual possui **52 empreendimentos e 70 unidades publicadas**. Existem coordenadas válidas para **49 empreendimentos e 67 unidades**, por isso o mapa mostra 49 marcadores agrupados.

Os três cadastros abaixo não têm coordenadas e também não têm número de rua suficiente para determinar um ponto confiável:

1. **Edifício Prime Boulevard** — Alameda Jauaperi, Moema.
2. **Reserva Campo Belo** — Rua Morais de Barros, Campo Belo.
3. **You Vila Conceição** — Rua Ibirajá, Vila Guarani.

Colocar um ponto aproximado inventado faria o cliente enxergar o imóvel no endereço errado. A correção profissional é completar número e coordenadas desses três produtos no ERP. Assim que esses dados existirem, o site os inclui automaticamente, sem nova alteração de código.

## Validação executada

- **84 testes automatizados aprovados; 0 falhas**.
- Build de produção concluído e pacote validado.
- Smoke test aprovado em seis rotas ativas e uma rota desativada.
- Orçamento de tamanho inicial aprovado.
- Auditoria Lighthouse real em Chrome para celular e computador.
- Verificação de catálogo, mapa, galeria, modais, foco, carregamento e tamanhos responsivos.
- Verificação de que não há chave `service_role`, segredo administrativo ou credencial privilegiada no frontend.
- Migrações aplicadas e verificadas no Supabase de produção.

## Plano para manter o padrão 10/10

### Prioridade imediata — dados do ERP

- Completar endereço e coordenadas dos três empreendimentos listados.
- Tornar número, latitude e longitude obrigatórios antes da aprovação para o site.
- Bloquear publicação sem foto de capa, preço válido, descrição comercial e características mínimas.
- Exibir no ERP uma fila “incompleto para o site”, com o motivo exato de cada bloqueio.

### Próxima evolução — desempenho móvel

- Servir um primeiro quadro estático antes da inicialização completa do aplicativo.
- Empacotar e minificar os recursos centrais em um único processo de produção.
- Gerar automaticamente derivados WebP/AVIF das fotos do ERP no envio.
- Medir Core Web Vitals de visitantes reais, separados por aparelho, conexão e página.

Esses itens buscam aproximar o laboratório móvel de 100/100, mas não bloqueiam a publicação atual: o site já está na faixa verde e sem falhas objetivas nas categorias auditadas.

### Operação contínua

- Executar testes e Lighthouse antes de cada publicação de design.
- Manter o orçamento máximo de carga inicial no pipeline.
- Alertar quando um imóvel publicado estiver sem coordenada, capa ou preço coerente.
- Acompanhar semanalmente conversão, erros de formulário e páginas lentas.

## Critério de aceite da entrega

A entrega pode ser publicada quando:

1. os 84 testes permanecerem verdes;
2. build, verificador e smoke test passarem;
3. nenhuma credencial privilegiada estiver no frontend;
4. Lighthouse mantiver 100 em acessibilidade, boas práticas e SEO;
5. o desempenho móvel permanecer na faixa verde;
6. catálogo, galeria, mapa e financiamento funcionarem no navegador real;
7. a revisão automática do repositório estiver aprovada.
