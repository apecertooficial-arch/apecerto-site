# Auditoria final de produção — Site ApêCerto

**Data da auditoria:** 27/08/2026, encerrada às 15:20 BRT  
**Escopo:** avaliação somente leitura de `https://apecerto.com`  
**Veredito:** **AINDA NÃO É 10/10**  
**Nota global ponderada:** **8,3/10**

## 1. Resumo executivo

A versão esperada está realmente publicada, o PR foi mesclado com CI verde e os fluxos principais funcionam em produção. O Site tem identidade visual coerente, busca utilizável, fichas pré-renderizadas corretamente, boa resposta de laboratório e um fluxo público de financiamento que não exige sessão e rejeita origem/payload inválidos.

O Site ainda não pode ser chamado de 10/10 porque cinco condições objetivas falham:

1. uma busca filtrada apresentou **19 resultados e 17 marcadores**, sem o aviso dinâmico dos dois resultados fora do mapa;
2. SEO e sitemap não têm reconstrução automática nem SLA quando o catálogo muda;
3. não existem dados suficientes de Core Web Vitals de campo/RUM para sustentar nota máxima;
4. a galeria fechada por `Escape` não devolveu o foco ao gatilho, e o painel de filtros não possui nome acessível explícito;
5. uma imagem pública do MOA usada em metadados pesa **8.064.415 bytes** e responde com `Cache-Control: no-cache`.

Não foi encontrada falha P0. Há P1 de integridade de descoberta, SEO operacional, desempenho de mídia e comprovação de produção.

## 2. Versão realmente avaliada

| Evidência | Resultado |
|---|---|
| Domínio | `https://apecerto.com` |
| `/version.json` | `4625084b4c73d269` |
| Source fingerprint | `4625084b4c73d269b71da14767af058e3af33b1b5041696826fc198a8d3c161e` |
| Design SHA-256 | `0f6fb0035483af3e3aba7293ac15801133a188255d0088cb0aa0e824e6ebf13f` |
| Artefato SHA-256 | `94c841a8861fa5e3e1b7480affd021a729a0372f08a7c0d4a31667cbd5dcb84f` |
| Catálogo do build | 53 registros, 124 páginas, hash `8b931ba6…31dc` |
| Catálogo gerado em | `2026-08-27T17:26:59.177Z` |
| PR | [#32](https://github.com/apecertooficial-arch/apecerto-site/pull/32), fechado e mesclado |
| Squash merge | `74c7fcb04cc5b7afc4fd8e5545f4d338968d597d` |
| HEAD atual da `main` | o mesmo SHA; nenhum commit posterior |
| CI do merge | `validate`: concluído com sucesso |
| Preview temporário | indisponível/404 após o merge, coerente com remoção automática |

O `render.yaml` publicado define Static Site, build `npm run ci`, publicação de `dist` e não contém rewrite de `/imovel/*` para Edge Function. As fichas são arquivos `dist/imovel/<slug>/index.html`. A Edge Function `site-seo` não participa da entrega HTTP das fichas.

## 3. Rubrica e nota ponderada

Os pesos totalizam 110 pontos. Segurança, dados/mapa, integração, SEO, conversão e publicação recebem peso superior a cosmética.

| Área | Nota | Peso | Justificativa resumida |
|---|---:|---:|---|
| 1. Identidade visual e Design System | 9,4 | 5 | Laranja `#FF7000`, roxo `#8B00CC`, Quicksand, neutros e foco roxo aderentes ao sistema oficial. |
| 2. Site desktop | 8,9 | 7 | Sem overflow; lista, ficha, mapa e galeria funcionam. Falha de aviso no mapa filtrado reduz confiança. |
| 3. Site mobile | 8,7 | 8 | 390×844 sem overflow, CTA estável e mapa utilizável. Foco da galeria não retorna ao gatilho. |
| 4. Busca, filtros e descoberta | 9,1 | 8 | Filtros persistem na URL e no retorno da ficha; 19 resultados reproduzíveis. |
| 5. Mapa e integridade geográfica | 7,8 | 9 | Catálogo geral: 71 unidades, 68 mapeadas e aviso de 3 sem coordenadas. Busca filtrada: 19/17 sem aviso. |
| 6. Ficha, galeria e conversão | 8,8 | 10 | Ficha isolada, 1 H1, 16 fotos e navegação funcionando; foco pós-modal e prova de conversão real ainda insuficientes. |
| 7. Integração Site ↔ Produtos | 8,5 | 10 | Corpo dinâmico usa visão pública canônica; catálogo atual bate em 53/124. Metadados dependem de novo build. |
| 8. SEO técnico/editorial | 7,8 | 10 | Fichas e 404 corretos; sem automação/SLA de reconstrução, home sem imagem social e 11 entidades sem imagem SEO no snapshot. |
| 9. Desempenho de laboratório | 9,3 | 8 | Todas as medianas dentro das metas; outlier de mídia MOA com 8,1 MB impede 10. |
| 10. Maturidade de Core Web Vitals/RUM | 4,0 | 5 | Não há semanas de CrUX/RUM nem INP de campo comprovado. |
| 11. Acessibilidade | 7,8 | 6 | Estrutura, foco visível e rótulos em geral bons; duas falhas de modal e alternativa textual do mapa limitada. |
| 12. Segurança e privacidade | 8,0 | 8 | HSTS/frame/MIME/referrer e endpoint financeiro seguros; CSP apenas Report-Only e escrita genérica de leads ainda depende de cliente/RLS. |
| 13. Formulários e tracking | 8,6 | 8 | Financiamento rejeita origem/payload inválidos e `generate_lead` ocorre após persistência no código; sem lead real ou prova E2E final. |
| 14. Confiabilidade operacional e deploy | 8,0 | 8 | Versão, CI, artefato e 404 rastreáveis; rebuild editorial e observabilidade não têm SLA automático. |

**Cálculo:** soma de `nota × peso` dividida por 110 = **8,2809**, arredondada para **8,3/10**.

## 4. Evidências funcionais

### Desktop 1440×900

- Home carregou com um único H1, sem overflow horizontal.
- Cores computadas incluíram `rgb(255,112,0)` e tipografia Quicksand.
- Busca direta `?tipo=studio&area_min=24&area_max=35` retornou **19 apês**.
- URL manteve os três filtros; ao abrir uma ficha, a query permaneceu na URL.
- Voltar restaurou catálogo com os mesmos 19 resultados.
- A ficha exibiu somente seu conteúdo, sem hero/home montados atrás.
- Galeria, fotos, semelhantes, visita, WhatsApp e financiamento ficaram visíveis sem submissão.
- Console do fluxo final: nenhum erro ou warning registrado.

### Mobile 390×844

- Catálogo e ficha sem rolagem horizontal.
- Alternância Lista/Mapa acessível; mapa ocupou 335×420 px no viewport e respondeu ao controle.
- Painel de filtros levou foco ao primeiro campo; `Escape` fechou e devolveu foco ao botão `Filtros (3)`.
- Ficha AP0152 exibiu CTA fixo de 71 px no rodapé sem ultrapassar o viewport.
- Galeria abriu com 16 fotos; avançar alterou de 5/16 para 6/16.
- Ao fechar a galeria por `Escape`, o foco caiu no corpo da página, não no gatilho `Ver 16 fotos`.
- Retorno ao catálogo preservou os filtros e os 19 resultados.
- O swipe físico não foi comprovado; navegação anterior/próxima foi comprovada.

### Integridade dos dados públicos

| Medida atual | Resultado |
|---|---:|
| Empreendimentos/registros públicos detalhados | 53 |
| Unidades elegíveis exibidas pelo catálogo | 71 |
| Unidades com coordenadas válidas | 68 |
| Unidades sem coordenadas válidas | 3 |
| Entidades/fichas canônicas geradas | 124 |
| URLs no sitemap de catálogo | 130 |
| Entidades sem preço válido no feed SEO | 0 |
| Entidades sem área válida no feed SEO | 0 |
| Entidades sem descrição essencial no feed SEO | 14 |
| Entidades sem imagem no feed SEO | 11 |
| Entidades sem slug canônico derivável | 0 |
| Tipologia editorial completa | não comprovada pela projeção SEO consultada |

O catálogo geral informa corretamente que três resultados ficam na lista sem aparecer no mapa. Entretanto, no filtro de studios de 24–35 m² foram observados 19 resultados e 17 marcadores, sem aviso. Nenhum marcador `0,0` ou no oceano foi renderizado; o problema é transparência/contagem, não coordenada inventada.

## 5. SEO técnico e editorial

### HTTP antes do JavaScript

| Rota | Status | Content-Type | Canonical/robots |
|---|---:|---|---|
| `/` | 200 | `text/html; charset=utf-8` | canonical autorreferente, index/follow |
| AP0152 canônico | 200 | `text/html; charset=utf-8` | title, canonical, OG, Twitter e Apartment JSON-LD específicos |
| AP0096 canônico | 200 | `text/html; charset=utf-8` | metadados distintos e factuais |
| `/imovel/inexistente-auditoria/` | 404 | `text/html; charset=utf-8` | `noindex,nofollow`, sem canonical da home |
| `/sitemap-catalogo.xml` | 200 | `application/xml; charset=utf-8` | 130 URLs |
| `/robots.txt` | 200 | `text/plain; charset=utf-8` | coerente com sitemap |

Os JSON-LD válidos continham `RealEstateAgent` e `Apartment`; o inválido continha `WebPage`. O serializador substitui `<`, `>`, `&`, separadores Unicode e escapa HTML/XML. Nenhum campo de proprietário ou observação interna foi encontrado nas amostras.

Lacunas:

- não há gatilho confiável do ERP para reconstruir Render quando publicar, despublicar ou editar imóvel;
- portanto o tempo máximo de defasagem de SEO é **indefinido** até um novo build;
- a home não apresentou `twitter:card` nem `og:image` no HTML inicial;
- 11 entidades do snapshot não tinham imagem SEO disponível;
- a ficha MOA usa como OG principal um GIF de 8.064.415 bytes e `no-cache`.

## 6. Desempenho e estabilidade

Medição própria via Chrome headless, cache HTTP desativado, rede real, três execuções por caso. Valores abaixo são medianas. São **laboratório**, não CrUX/INP de campo.

| Caso | LCP | TBT | CLS | FCP | TTFB | Transferência | Requisições |
|---|---:|---:|---:|---:|---:|---:|---:|
| Home mobile | 404 ms | 0 ms | 0 | 168 ms | 23 ms | 473.416 B | 26 |
| Ficha mobile AP0152 | 796 ms | 0 ms | 0 | 164 ms | 26 ms | 425.003 B | 31 |
| Home desktop | 1.104 ms | 12 ms | 0,0006 | 264 ms | 27 ms | 527.374 B | 28 |
| Ficha desktop AP0152 | 972 ms | 0 ms | 0,0030 | 172 ms | 27 ms | 478.935 B | 31 |

Na primeira execução fria da home mobile, LCP foi 1.408 ms e TTFB 536 ms; ainda dentro da meta. Não houve overflow nem imagem já concluída com largura natural zero nos quatro casos medidos.

Limitações:

- não houve throttling padronizado Lighthouse; os números servem para regressão interna, não como selo de campo;
- não há INP de usuários, percentil 75, segmentação por dispositivo ou série histórica;
- o GIF do MOA não entrou nas páginas medidas e pode adicionar 8,1 MB ao acessar esse imóvel;
- o erro eventual do Microsoft Clarity não reapareceu no fluxo final e permanece sem frequência mensurada.

## 7. Acessibilidade e Design System

O Design System oficial foi conferido no ZIP informado. A produção usa:

- laranja `#FF7000` e roxo `#8B00CC`;
- Quicksand como família principal;
- neutros quentes, radius e estados coerentes;
- outline visível de 3 px roxo;
- Lucide e hierarquia H1/H2 coerente nas amostras;
- todas as imagens inspecionadas tinham atributo `alt`, ainda que tiles decorativos usem vazio.

Problemas comprovados:

1. galeria fechada com `Escape` não devolve foco ao botão de abertura;
2. modal de filtros tem `role=dialog`, porém sem `aria-label`/`aria-labelledby` observado;
3. controles do Leaflet anunciam “Zoom in” em inglês;
4. mapa possui `role=region` e `aria-label`, mas falta uma alternativa textual completa listando os imóveis atualmente representados;
5. uma execução automatizada Axe/Lighthouse não estava disponível no ambiente; a nota usa inspeção DOM, teclado real, heurísticas e os testes de acessibilidade do projeto. Isso impede nota máxima.

## 8. Segurança, privacidade, formulários e tracking

### Comprovado

- nenhum `service_role`, `sb_secret_`, chave privada ou token administrativo encontrado nos artefatos de frontend; a única ocorrência textual de `sb_secret_` é uma guarda de build que rejeita esse tipo de chave;
- HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` e `Referrer-Policy: strict-origin-when-cross-origin` ativos;
- política de permissões restritiva configurada;
- CSP existe somente como `Content-Security-Policy-Report-Only`, não como bloqueio;
- `OPTIONS` do financiamento com origem ApêCerto: 204 e CORS restrito à origem;
- `OPTIONS` com origem externa: 403 `origin_not_allowed`;
- POST `{}` com origem ApêCerto: 400 `invalid_request`, sem criar lead;
- POST `{}` com origem externa: 403;
- cliente envia apenas campos permitidos, normaliza contato, usa idempotência, timeout e não envia chave/sessão Supabase ao endpoint financeiro;
- código dispara `generate_lead` somente após resposta 202 válida com `conversion_event_id`;
- dados de portal, Sara e identidade são marcados para mascaramento no Clarity.

### Não comprovado

- sucesso E2E em produção não foi repetido porque a auditoria proibiu lead real;
- deduplicação real no banco não foi exercitada nesta rodada;
- políticas RLS da escrita genérica em `site_leads` não foram auditadas no banco;
- outros leads ainda fazem POST direto do navegador para `site_leads` com chave pública. Isso não é prova de exploração, mas fica abaixo do padrão arquitetural do endpoint dedicado de financiamento e requer revisão específica.

## 9. Comparação funcional com QuintoAndar

Referência atual consultada: [busca de imóveis à venda em São Paulo](https://www.quintoandar.com.br/comprar/imovel/sao-paulo-sp-brasil/apartamento/casa).

| Dimensão | ApêCerto vs. QuintoAndar | Avaliação |
|---|---|---|
| Busca básica e filtros | Próxima no núcleo | ApêCerto cobre preço, área, tipo, quartos, vagas, banheiros e suítes; QuintoAndar expõe mais filtros, metrô, mobiliado e alerta. |
| Mapa | Inferior | QuintoAndar oferece desenho de área e mapa de escala madura; ApêCerto tem boa divisão, mas falhou na transparência 19/17. |
| Cards | Inferior em custos | ApêCerto é mais limpo e coerente com a marca, porém QuintoAndar mostra condomínio + IPTU diretamente. |
| Galeria/ficha | Competitiva no catálogo curado | ApêCerto tem boa narrativa e CTAs; QuintoAndar tem maturidade maior de mídia, custos e confiança operacional. |
| Mobile | Competitiva, não equivalente | ApêCerto não transborda e mantém filtros; ainda há falha de foco e swipe não comprovado. |
| Velocidade percebida | Potencialmente superior nas páginas medidas | Catálogo menor e transferências abaixo de 0,53 MB; o GIF MOA é exceção grave. |
| Confiança e clareza | Diferente e parcialmente superior | Curadoria local e atendimento direto são diferenciais legítimos; custos totais e métricas de operação ainda são menos transparentes. |

A menor quantidade de imóveis não é defeito por si só: é uma escolha coerente com a curadoria em Moema. Não se recomenda copiar identidade, texto ou layout do QuintoAndar.

## 10. Divergências entre checkpoint e produção

1. **Checkpoint confirmado:** versão, PR, SHA, CI, 53 registros, 124 fichas, 130 URLs e ausência de Edge rewrite.
2. **Contagem esclarecida:** 53 são empreendimentos/registros do feed SEO; 71 são unidades publicadas exibidas ao cliente. Não são números conflitantes.
3. **Imagem MOA:** o objeto antes observado como ausente agora responde 200; o problema atual é tamanho de 8,1 MB e `no-cache`, não 404.
4. **Clarity:** o erro ocasional anterior não foi reproduzido no fluxo final; frequência continua não comprovada.
5. **Nova falha observada:** busca filtrada 19 resultados/17 marcadores sem aviso, embora a home geral avise corretamente sobre três sem localização.

## 11. Backlog priorizado

### P0

Nenhum P0 reproduzido.

### P1

| Problema | Evidência | Impacto comercial | Correção | Critério de aceite |
|---|---|---|---|---|
| Mapa filtrado sem transparência | 19 resultados, 17 marcadores, nenhum aviso | Cliente pode concluir que imóveis sumiram ou que o mapa está incorreto | Calcular exclusões sobre o conjunto filtrado/expandido e renderizar aviso sempre que `lista > mapa` | Para qualquer filtro, `lista = marcadores representados + sem coordenadas`; aviso mostra a diferença; testes para geral e filtro 24–35 m² |
| SEO sem rebuild automático/SLA | Render só reconstrói após mudança Git; corpo muda antes do snapshot | Página despublicada ou preço alterado pode permanecer indexável/desatualizado | Evento seguro do ERP chama deploy hook protegido ou agenda rebuild; registrar último catálogo aplicado | Publicação/despublicação/edição reflete HTML+sitemap em até 15 min; falha alerta e não publica snapshot parcial |
| GIF MOA de 8,1 MB e sem cache | HTTP 200, 8.064.415 B, `no-cache` | Galeria/card/social podem ficar lentos e consumir dados móveis | Gerar poster WebP/AVIF dimensionado; manter GIF apenas sob interação, ou converter vídeo; cache imutável | Nenhuma imagem inicial >300 KB; ficha MOA dentro de +10% da mediana de transferência; OG retorna imagem estática válida |
| Ausência de CWV/RUM confiável | Sem INP p75, série histórica ou segmentação | Regressões reais podem passar por CI e afetar conversão | Medir LCP/INP/CLS p75 por rota/dispositivo com consentimento e alerta | 28 dias de dados, dashboard, orçamento por rota e alertas; p75 nas metas |
| Arquitetura de leads não financeiros não comprovada | POST direto a `site_leads` depende de chave pública/RLS | Abuso, spam e inconsistência podem atingir CRM | Auditar RLS e migrar comprador/proprietário para endpoint dedicado validado/rate-limited | Origem/payload/duplicidade testados; nenhuma escrita ampla do navegador; testes de abuso e RLS verdes |

### P2

| Problema | Evidência | Impacto comercial | Correção | Critério de aceite |
|---|---|---|---|---|
| Foco da galeria | Escape devolveu foco ao corpo | Usuário de teclado perde posição | Guardar gatilho e restaurar foco em todos os fechamentos | Clique, Escape e botão fechar devolvem foco ao mesmo controle |
| Nome do modal de filtros | `role=dialog` sem nome observado | Leitor de tela recebe contexto incompleto | `aria-labelledby` apontando para “Mais filtros” | Axe sem `aria-dialog-name`; nome anunciado em NVDA/VoiceOver |
| CSP apenas Report-Only | Cabeçalho de bloqueio ausente | Mitigação de XSS não é aplicada | Corrigir violações legítimas e promover CSP gradualmente | CSP bloqueante ativa sem quebrar mapa, analytics ou formulários |
| Home sem imagem social | Sem `og:image` e Twitter Card no HTML inicial | Compartilhamento menos convincente | Adicionar arte estática oficial otimizada | Debuggers OG/Twitter mostram título, descrição e imagem válida |
| 14 descrições e 11 imagens SEO ausentes | Feed SEO atual | Snippets/fichas menos persuasivos | Critério de qualidade no ERP antes da publicação | Nenhuma entidade indexável sem descrição e imagem mínima |
| Leaflet em inglês e mapa sem alternativa completa | “Zoom in”; região apenas genérica | Experiência inconsistente para leitor de tela | Localizar controles e fornecer lista textual sincronizada | Todos os controles em pt-BR e imóveis acessíveis fora do mapa |

## 12. Riscos e itens não comprovados

- INP/Core Web Vitals de campo e comportamento em redes móveis lentas reais;
- swipe físico da galeria;
- sucesso e deduplicação de formulário em produção, deliberadamente não enviados;
- políticas RLS de todas as tabelas de lead;
- contraste automatizado completo e teste com NVDA/VoiceOver;
- comportamento mobile atual do QuintoAndar não foi concluído porque o navegador externo excedeu o prazo de inspeção; a comparação mobile usa a página atual carregada, sua estrutura pública e evidências de desktop, sem alegar equivalência pixel a pixel;
- frequência real do erro Microsoft Clarity;
- trailing slash e todas as variantes antigas de slug além das rotas amostradas.

## 13. Próximo prompt técnico

```text
MISSÃO: remover exclusivamente os bloqueios P1/P2 da auditoria final de produção do Site ApêCerto, preservando o Design System e sem alterar dados comerciais.

Contexto confirmado:
- relatório: docs/auditoria-final-producao-site-2026-08-27.md;
- produção avaliada: versão 4625084b4c73d269, commit 74c7fcb04cc5b7afc4fd8e5545f4d338968d597d;
- nota atual 8,3/10;
- mapa geral: 71 unidades, 68 mapeadas, 3 sem coordenadas;
- reprodução crítica: /?tipo=studio&area_min=24&area_max=35 mostra 19 resultados, 17 marcadores e nenhum aviso;
- SEO/sitemap são snapshots de build sem trigger/SLA do ERP;
- imagem empreendimentos/moa/4lq4pd7p32p.gif pesa 8.064.415 bytes e usa no-cache;
- galeria não restaura foco ao gatilho em Escape;
- modal de filtros não tem nome acessível explícito;
- CSP está somente em Report-Only;
- home não tem imagem social;
- 14 entidades sem descrição e 11 sem imagem no feed SEO;
- leads não financeiros ainda escrevem diretamente em site_leads via navegador e precisam de auditoria específica.

Regras:
1. Trabalhe em branch própria e preserve #FF7000, #8B00CC, Quicksand e componentes oficiais.
2. Não invente coordenada, preço, foto ou descrição. Falta de dado deve ser transparente.
3. Corrija primeiro o cálculo/aviso do mapa filtrado com testes que garantam lista = mapeados + sem coordenadas.
4. Implemente rebuild seguro acionado pelo ERP sem expor deploy hook no navegador; SLA máximo 15 minutos, idempotência, logs e alerta de falha. Build deve continuar fail-closed.
5. Otimize o MOA com poster WebP/AVIF <=300 KB; animação só após interação. OG deve usar imagem estática.
6. Corrija restauração de foco da galeria, nome do diálogo, localização pt-BR e alternativa textual do mapa. Rode Axe e teste teclado/VoiceOver ou NVDA.
7. Proponha CSP bloqueante a partir das violações reais; não ative em produção antes de preview verde.
8. Adicione OG/Twitter da home e gate editorial que impeça indexação de ficha sem descrição/imagem mínima, sem inventar conteúdo.
9. Audite RLS de site_leads e migre comprador/proprietário para endpoint dedicado com allowlist, normalização, rate limit, idempotência e teste de origem. Não envie lead real.
10. Instale/ative RUM consentido para LCP/INP/CLS p75 por rota e dispositivo, sem PII, com orçamento e alertas.
11. Execute lint, typecheck quando houver, build, testes, smoke, SEO HTTP direto, segurança, desktop 1440×900 e mobile 390×844.
12. Crie preview e pare para autorização antes de merge/deploy. Não altere produção, Render, Supabase ou banco sem autorização específica.

Critérios mínimos do preview:
- filtro reproduzido: 19 = 17 marcadores + aviso de 2 sem localização;
- nenhuma coordenada inválida renderizada;
- ficha/galeria/filtros acessíveis por teclado, foco restaurado;
- nenhuma imagem inicial >300 KB e ficha MOA sem regressão >10%;
- HTML/sitemap atualizados automaticamente em ambiente seguro dentro do SLA;
- CSP sem violações críticas;
- endpoints públicos rejeitam origem/payload/duplicidade e não expõem segredo;
- nenhum generate_lead antes de persistência;
- Axe sem violações críticas/sérias;
- três medições por caso com medianas dentro de LCP 2,5 s, TBT controlado e CLS 0,1.

Entregue diff, testes, preview, riscos e nova auditoria independente. Não declare 10/10 sem dados de campo suficientes.
```

## 14. Registro de não alteração

Durante esta auditoria não houve commit, push, merge, deploy, rollback, preview, alteração no Render/Supabase/banco/domínio, edição de imóvel ou envio de lead/WhatsApp. A única escrita realizada foi este relatório Markdown solicitado. Consultas ao catálogo, GitHub e endpoints públicos foram somente leitura; os POSTs financeiros usaram payload vazio inválido e retornaram 400/403, sem criação de lead.
