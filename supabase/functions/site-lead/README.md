# site-lead

Porta protegida dos leads **comprador** e **proprietário** do site. Substitui o
POST anon direto em `site_leads` feito por `window.apecertoSubmitSiteLead`.
Financiamento continua em `site-financing-lead`.

## Contrato

- `POST /functions/v1/site-lead`, `verify_jwt = false`, sem `apikey`/`Authorization`
- CORS: `https://apecerto.com`, `https://www.apecerto.com`, `https://apecerto-site.onrender.com`
- Corpo: `request_id` (UUID gerado no navegador por envio), `nome`, `telefone`,
  `email?`, `lead_type` (`comprador` | `proprietario`), `empreendimento_id?`,
  `unidade_id?`, `empreendimento_nome?`, `preferencia_horario?`,
  `page_view_id?`, `tracking?`, `context?` (lista fechada), `website?` (honeypot)
- Respostas:
  - `202 {ok, accepted, duplicate:false, id, request_id}` — lead criado
  - `200 {ok, accepted, duplicate:true, id, request_id}` — mesmo `request_id`
    ou mesmo telefone+tipo+imóvel em 30 min
  - `400 {ok:false, error}` — `invalid_request_id`, `invalid_lead_type`,
    `invalid_name`, `invalid_phone`, `invalid_email`, `invalid_empreendimento_id`,
    `invalid_unidade_id`, `invalid_context`, `invalid_tracking`, `unexpected_field`…
  - `429 {ok:false, error:'rate_limited'}` — 10 envios/h por IP ou 3/h por telefone
  - `403` origem não permitida · `503` indisponível

## Proteções

A RPC `public.site_lead_ingest` (migration do ERP
`20260917160000_fase3_site_lead_protegido.sql`) roda numa transação:
idempotência por `request_id` (índice único em `site_leads.request_id`) →
limite por HMAC do IP e do telefone (tabela `private.site_financing_lead_rate_usage`,
escopos `lead_ip`/`lead_phone`) → validação → dedupe 30 min → insert. IP e
telefone brutos nunca vão para a tabela de limite. Honeypot preenchido recebe
202 falso sem gravar.

## Transição

O navegador tenta a Edge; em falha de rede/404/5xx cai no POST anon antigo com
o **mesmo** `request_id` (409 = já gravado). A policy anon fica ativa por pelo
menos 7 dias (páginas em cache); o passo de remoção está documentado na migration.
