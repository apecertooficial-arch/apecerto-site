# CSP — decisão desta fase

## Decisão

Manter `Content-Security-Policy-Report-Only`. Não promover para bloqueante sem evidência em preview/produção de que mapa, analytics, vídeos e formulários permanecem íntegros.

## Dependências reais do frontend atual

- runtime do Cloud Design usa script inline e avaliação dinâmica;
- estilos do template e do Leaflet usam conteúdo inline;
- mapa carrega Leaflet e tiles de origens externas já enumeradas;
- analytics pode carregar Google Tag Manager, Google Analytics, Meta e Clarity conforme consentimento;
- tours e vídeos podem usar YouTube, Google Maps e hosts autorizados.

## Evidência observada em 27/08/2026

Na rota de produção `/?tipo=studio&area_min=24&area_max=35`, após o catálogo e o mapa carregarem, o console não registrou violação de `Content-Security-Policy-Report-Only`. O único aviso foi a falha de carregamento do GIF antigo do MOA, problema corrigido localmente neste PR com um pôster do próprio deploy.

Isso não é evidência suficiente para bloquear a política: os caminhos condicionais de analytics com consentimento, vídeos/tours e submissões não foram executados nesta fase. A dependência conhecida de `'unsafe-inline'` e `'unsafe-eval'` pelo runtime atual também precisa ser removida ou isolada antes de uma política estrita útil. Portanto, não existe uma violação CSP específica a liberar nesta rodada; existe cobertura incompleta dos fluxos condicionais.

## Como validar antes de promover

1. Publicar a mesma política em modo Report-Only num preview isolado.
2. Exercitar home, filtros, mapa, duas fichas, galeria, consentimento e estados visuais de formulários em desktop e 390×844.
3. Coletar cada violação com `effective-directive`, origem bloqueada e fluxo que a gerou.
4. Remover permissões somente quando não houver uso real; nunca silenciar origem desconhecida adicionando curinga.
5. Repetir os testes com a política bloqueante no preview.

## Gate

A política só pode ser promovida quando não houver erro funcional, requisição essencial bloqueada nem violação sem causa identificada. Esta fase não altera o header de produção.
