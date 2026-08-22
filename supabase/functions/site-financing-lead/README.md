# site-financing-lead

Endpoint público dedicado ao primeiro contato de financiamento. O navegador não
recebe chave secreta e não grava `site_leads` diretamente.

## Contrato público

- URL: `POST /functions/v1/site-financing-lead`
- CORS: somente `https://apecerto.com` e `https://www.apecerto.com`
- Autenticação do navegador: nenhuma (`verify_jwt = false`); não enviar
  `apikey` nem `Authorization`
- Headers: `Content-Type: application/json` e
  `X-Idempotency-Key: <UUID>`
- O UUID do header deve ser igual a `request_id` e `event_id` no JSON
- Resposta aceita: HTTP 202 com `ok`, `accepted`, `duplicate`, `request_id` e
  `conversion_event_id`

O backend normaliza contato e atribuição consentida, deriva nome/código/preço
do imóvel diretamente do catálogo publicado e grava `origem` como
`site_financiamento`. IP bruto, chave de serviço e IDs internos do CRM nunca
são devolvidos nem persistidos nos recibos técnicos.

## Proteções

- limite atômico de 10 pedidos/hora por HMAC do IP do gateway;
- limite de 3 pedidos/15 minutos por HMAC de `page_view_id` + user-agent;
- mesmo `request_id` é idempotente; reutilização com outro payload retorna 409;
- mesma combinação de contato, imóvel, renda e percentual dentro de uma janela
  móvel de 30 minutos não cria outro lead; a trava transacional também cobre
  pedidos simultâneos e a virada da meia hora;
- `conversion_event_id` é estável e o ingest first-party impede duas
  conversões `generate_lead` com o mesmo ID;
- financiamento direto pelo papel `anon` é recusado; comprador e proprietário
  mantêm o contrato público anterior.

## Ordem de publicação

1. Aplicar `20260822150000_site_financing_lead_secure.sql`.
2. Executar `20260822_site_financing_lead_secure_verificacao.sql`.
3. Fazer deploy desta função com `verify_jwt=false`.
4. Confirmar o preflight e um pedido controlado; só então publicar o frontend
   que aponta para o endpoint.

Se qualquer etapa falhar, não ativar o novo chamador. A função depende apenas
dos segredos automáticos `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já
fornecidos pelo runtime da Supabase.
