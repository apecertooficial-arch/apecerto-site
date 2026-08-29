# Handoff — segurança de leads e telemetria de Web Vitals

## Objetivo

Tratar separadamente duas dependências de backend que não podem ser alteradas neste PR local do Site.

## Segurança de leads

Revisar o endpoint público de leads com validação de origem e payload, lista explícita de campos, normalização, idempotência, proteção contra abuso, resposta sanitizada e gravação auditável. Nenhuma chave privilegiada pode chegar ao frontend.

Critérios mínimos:

- envio público legítimo sem sessão de usuário;
- duplicata reconhecida sem gerar dois leads ou duas conversões;
- rate limit por sinais não sensíveis;
- eventos de sucesso somente depois da gravação;
- testes de ausência de segredo no bundle.

## Web Vitals

O frontend já possui `PerformanceObserver` disponível nos navegadores modernos e um transporte próprio, mas a função `site-track` aceita somente eventos e propriedades enumerados. `web_vital`, `metric_name`, `metric_value` e `metric_rating` não pertencem às listas atuais. Enviar esses dados hoje seria rejeitado pelo backend; reutilizar outro evento seria semanticamente incorreto.

Implementação futura mínima:

1. Autorizar `web_vital` e somente as propriedades agregáveis necessárias.
2. Instrumentar LCP, CLS e INP no `analytics.js`, com um envio final por métrica e por `page_view_id`.
3. Não enviar seletor, conteúdo de elemento, URL com parâmetro sensível nem dado de usuário.
4. Respeitar consentimento e a política de retenção já vigente.
5. Cobrir transporte, sanitização, duplicidade e navegadores sem `PerformanceObserver`.

## `site-track` — 403 no gateway

A inspeção desta branch encontrou a função `supabase/functions/site-track`, e o frontend chama o endpoint público por Beacon/fetch sem credencial privilegiada. Entretanto, `supabase/config.toml` só explicita `verify_jwt = false` para `site-seo` e `site-financing-lead`; não há uma seção equivalente para `site-track`. Isso é compatível com o 403 ocorrer no gateway antes de a validação de origem/payload da função ser executada.

Próxima ação do responsável de infraestrutura, fora deste PR:

1. confirmar nos logs que o 403 vem da verificação JWT do gateway;
2. revisar a versão atual da função e sua allowlist de origem/payload;
3. declarar a configuração pública estritamente para `site-track`, sem expor `service_role` no navegador e sem abrir tabela/RLS;
4. publicar a função/configuração em mudança separada, com teste de origem permitida, origem negada, payload inválido, rate limit e ausência de segredo no bundle;
5. só então executar um smoke sintético identificado e verificar persistência/dedupe.

Nenhuma alteração Supabase, função, RLS ou produção foi feita nesta rodada.

## Fora de escopo deste PR

Supabase, banco, função `site-track`, RLS, schema, migração ou credencial.
