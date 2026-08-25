# Auditoria de performance e qualidade do site ApêCerto

Data: 24/08/2026

Escopo: home, catálogo, mapa, galeria de fotos, carregamento inicial, rastreamento, acessibilidade, SEO, segurança e qualidade de entrega.

Estado avaliado: produção antes da correção e candidato local da branch `codex/otimizar-performance-site`.

## Resumo executivo

O site não é ruim: o visual, a proposta comercial e a experiência em desktop são bons. Porém, antes desta correção, ele não podia ser considerado excelente porque o carregamento móvel e a troca de fotos eram lentos, havia requisições inválidas e parte do JavaScript era executada repetidamente sem necessidade.

- Nota geral da produção antes da correção: **6,8/10**.
- Nota estimada do candidato local corrigido: **7,8/10**.
- Meta recomendada: **9/10**, após concluir os itens P1 deste documento e medir novamente no domínio publicado.

A nota do candidato é provisória até o deploy. Ambiente local e Render têm cache, compressão e latência diferentes; por isso, a validação definitiva deve ser feita no domínio real depois da publicação.

## Medições objetivas

| Indicador | Produção antes | Candidato local | Leitura |
|---|---:|---:|---|
| Lighthouse móvel — Performance | 52/100 | 72/100 | melhoria relevante; ainda abaixo da meta ≥85 |
| Lighthouse móvel — Acessibilidade | 91/100 | 91/100 | preservada |
| Lighthouse móvel — Boas práticas | 88/100 | 100/100 | corrigido |
| Lighthouse móvel — SEO da home | 92/100 | 100/100 | corrigido na home |
| Total Blocking Time | 920 ms | 163 ms | dentro da meta ≤200 ms |
| CLS | 0,008 | 0,008 | excelente e estável |
| Troca de foto, ponta a ponta | ~3,95 s | ~0,38–0,73 s | entre 81% e 90% mais rápida |
| Erros no console da auditoria | havia 404 | nenhum | corrigido |
| Testes automatizados | 62 na base auditada | 77 aprovados | cobertura ampliada |

O LCP simulado ainda oscila no ambiente local por causa do carregamento do runtime, do catálogo completo e de terceiros. A interação real da galeria melhorou, mas a arquitetura inicial ainda precisa ser enxugada.

## O que foi corrigido agora

1. **Fotos do catálogo e da ficha**
   - As imagens do Supabase passaram a ser solicitadas no tamanho adequado ao espaço em que aparecem.
   - Cards deixam de pedir uma foto de 1600 px quando exibem aproximadamente 384 px.
   - A próxima foto é preparada e decodificada antes de substituir a atual.
   - O prefetch é limitado às fotos adjacentes; a galeria inteira não é baixada de uma vez.

2. **Troca de fotos**
   - A página não recalcula mais ícones, mapa, URL e outras áreas em uma mudança exclusiva de imagem.
   - A foto atual permanece visível até a seguinte estar pronta ou até o limite seguro de espera.

3. **Carregamento inicial**
   - O grafismo crítico ganhou dimensões corretas, prioridade alta e preload.
   - O hero móvel ganhou uma fonte de imagem menor.
   - O template e a conexão com o catálogo são descobertos mais cedo pelo navegador.

4. **Rastreamento**
   - O Google Tag Manager passou a carregar após a página e em período ocioso.
   - Foi removida a competição entre GTM e um carregamento direto e duplicado do Google Analytics.
   - O fallback direto só entra se o contêiner realmente falhar.

5. **Erros e recursos de marca**
   - URLs literais de placeholders deixaram de gerar requisições inválidas.
   - Foram adicionados favicon SVG e favicon ICO reais da marca.
   - O arquivo de estado esperado pelo build deixou de responder 404.

6. **SEO e entrega**
   - A home agora preserva description, canonical, Open Graph, schema e favicon antes e depois da hidratação.
   - O pacote continua selado por fingerprint e respeitando os limites de transferência existentes.

## Avaliação ponto a ponto

| Área | Nota atual estimada | Diagnóstico |
|---|---:|---|
| Identidade visual e clareza comercial | 8,7 | identidade forte, busca clara e aparência profissional |
| Desktop | 9,0 | produção já apresentava Lighthouse 98 em performance |
| Mobile e velocidade | 7,2 | melhorou muito, mas o runtime e o catálogo ainda são grandes |
| Galeria de fotos | 8,0 | muito mais rápida; a meta final é resposta percebida ≤200 ms em foto já preparada |
| Mapa | 7,3 | funciona e mantém os imóveis válidos, mas Leaflet é carregado cedo e há três imóveis sem coordenada válida |
| Acessibilidade | 8,2 | foco e diálogos são bons; contraste, headings, slider e menu móvel ainda precisam revisão |
| SEO | 7,0 | home boa; fichas precisam metadados individuais já no HTML bruto e 404 HTTP real |
| Segurança e privacidade | 7,5 | consentimento e financiamento são bons; leads genéricos devem migrar para endpoint protegido |
| Dados do catálogo | 8,3 | campos críticos estão completos, mas há coordenadas inválidas e descrições curtas |
| Testes e confiabilidade | 8,0 | 74 testes, build, verificador e smoke verdes; faltam E2E e orçamento Lighthouse na CI |
| Manutenção | 7,0 | build protegido, porém HTML/runtime monolíticos e dependências grandes dificultam evolução |

## Plano urgente para chegar a 9/10

### P1 — maior retorno

1. **Criar catálogo leve:** a home recebe somente campos dos seis cards e do mapa; galeria e descrição completas são carregadas ao abrir a ficha. Meta: resposta inicial do catálogo abaixo de 100 KB.
2. **Carregar mapa sob demanda:** baixar Leaflet e tiles somente quando o mapa estiver próximo da tela ou quando o visitante escolher a visão Mapa.
3. **Reduzir JavaScript:** substituir o pacote completo do Lucide por apenas os ícones utilizados e dividir o runtime por rota.
4. **Otimizar fontes:** converter famílias TTF para WOFF2 variável e remover pesos não usados.
5. **SEO real das fichas:** entregar title, description, canonical, Open Graph e JSON-LD individuais no primeiro HTML; imóvel inexistente deve responder 404 real.
6. **Corrigir os dados do mapa:** bloquear publicação sem coordenada válida ou geocodificar os três imóveis pendentes com revisão humana.
7. **Proteger todos os leads:** comprador e proprietário devem usar endpoint com validação, rate limit e idempotência, como o financiamento.
8. **Acessibilidade móvel:** corrigir contraste laranja/branco, hierarquia de títulos, nome/estado do menu, alvo do slider e sobreposição do WhatsApp.

### P2 — consolidação

1. Adicionar teste E2E real para home, filtros, ficha, galeria, mapa, formulários e estados de erro.
2. Adicionar axe e Lighthouse ao CI com limites: Performance móvel ≥85, LCP ≤2,5 s, TBT ≤200 ms e zero 404.
3. Medir Web Vitals reais no domínio, segmentados por aparelho, página e conexão.
4. Revisar a migration da view `site_produtos` para eliminar divergência entre repositório e produção antes de qualquer recriação da view.

## Critérios de aceite finais

O site pode ser considerado excelente quando cumprir simultaneamente:

- Performance móvel ≥85 imediatamente e meta posterior ≥90;
- LCP ≤2,5 s, TBT ≤200 ms e CLS ≤0,1 no domínio publicado;
- troca de foto adjacente percebida em até 200 ms quando preparada;
- zero erro de console e zero requisição 404;
- metadata individual no HTML bruto e 404 real para imóvel inexistente;
- todos os imóveis publicados representáveis no mapa ou bloqueados editorialmente;
- testes de navegador, acessibilidade e performance bloqueando deploy regressivo.

## Validação executada nesta correção

- Lighthouse 13.4.1, emulação móvel e desktop;
- navegação real em desktop, incluindo home, cards, fotos e mapa;
- 77 testes automatizados aprovados, incluindo comportamento de consentimento, conversão antes do carregamento tardio e ausência de mapas de depuração quebrados;
- build e verificador bloqueante aprovados;
- smoke HTTP das seis rotas aprovado;
- pacote inicial dentro do orçamento existente: 477.821 bytes;
- nenhum segredo ou credencial privilegiada adicionado ao frontend.
