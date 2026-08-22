# Contrato Tracking 360 — ApêCerto

## Objetivo

Dar ao CEO uma leitura única do caminho anúncio → página → imóvel → intenção → lead → atendimento → visita → proposta → venda, preservando o consentimento do visitante e sem expor PII na área analítica.

## Fontes e responsabilidades

- `private.site_events_anon`: comportamento first-party do site. Não fica exposto ao navegador.
- `public.site_leads`: porta canônica dos formulários públicos.
- `private.lead_attribution`: first/last touch ligado ao `leads.id` do CRM.
- `private.tracking_delivery_logs`: recibos e retentativas da Meta CAPI.
- Google Analytics 4: análise consentida e modelagem do Google.
- Microsoft Clarity: mapas de calor e gravações mascaradas, somente com Analytics aceito.
- Meta Pixel + CAPI: navegador e servidor compartilham `event_id` para deduplicação, somente com marketing aceito.
- CRM CAPI: envia `LeadRespondeu`, `QualificacaoIniciada`, `LeadQualificado`, `Schedule`, `VisitaRealizada`, `PropostaEnviada` e `Purchase` a partir de fatos canônicos do ERP, com recibo, deduplicação e retentativa.

## Contrato explícito da Central de Automações

A atribuição Meta de entrada não é criada por gatilho, cron ou consumidor oculto da fila. O único fluxo oficial é `Entrada → Operações de campos → Registrar rastreamento Meta → próximo bloco`. O módulo `sync-meta-attribution-field-operation` chama `private.motor_atribuicao_meta_por_campos`; sua saída e `private.lead_attribution` são as fontes canônicas.

- sem `meta_lead_id`/`leadgen_id`, o módulo retorna `aplicado: false` e `meta_lead_id_ausente`;
- campanha, conjunto, anúncio, formulário, página, IDs e datas nunca são inventados;
- conflito de Meta Lead ID não remapeia outro lead silenciosamente;
- nenhuma função auxiliar pode escrever diretamente em `private.lead_attribution`;
- leitores, relatórios e exportações consomem `tracking_lead_attribution` ou o snapshot agregado;
- o módulo não distribui lead, não aborda, não altera etapa e só continua pela conexão desenhada no construtor.

## Endpoint para a área de Inteligência

Use os RPCs autenticados atualmente publicados:

```ts
const [{ data: dashboard }, { data: attribution }] = await Promise.all([
  supabase.rpc('tracking_360_dashboard', { p_days: 30 }),
  supabase.rpc('tracking_360_attribution_scope', { p_days: 30 }),
])
```

Permissão: `authenticated` com `public.is_equipe()` ou `service_role`. O retorno é agregado e não contém nome, telefone, e-mail, IP, `fbclid`, `gclid` ou identificadores de sessão individuais.

Seções retornadas:

- `traffic`: page views, sessões consentidas, engajamento de 30 s e média de tempo ativo.
- `funnel`: visitantes únicos por evento do funil.
- `abandonment`: formulário iniciado sem lead, tentativa sem lead e agendamento iniciado sem conclusão.
- `events`: volume total e page views distintos por evento.
- `pages`: acessos, imóveis vistos, leads e WhatsApp por página.
- `campaigns`: source, medium, campaign, acessos, imóveis, leads e WhatsApp.
- `properties`: imóvel, visualizações, galeria, favoritos, contatos e leads.
- `consent`: page views por nível essencial/analytics/marketing.
- `meta_delivery`: entregues, pendentes, falhos e tipos de eventos enviados à Meta.
- `crm_attribution`: leads atribuídos e cobertura de sinais Meta, Google e campaign ID.

## Vocabulário de eventos

Aquisição e navegação:

- `page_view`, `property_search`, `filter_change`, `view_inventory`
- `view_item`, com `item_id`, `item_name` e `from_item_id` quando há troca de imóvel
- `gallery_interaction`, `favorite_toggle`, `scroll_depth`
- `engagement_time` em 15, 30, 60, 120 e 300 segundos ativos
- `page_exit` com o tempo ativo acumulado

Intenção e contato:

- `whatsapp_click`, `phone_click`, `social_click`, `cta_click`
- `owner_cta_click`, `owner_portal_open`
- `form_start`, `form_submit_attempt`, `form_error`, `generate_lead`
- `schedule_start`, `schedule_field_select`, `schedule_complete`
- `financing_open`, `financing_change`
- `sara_open`, `sara_search`, `sara_results`, `sara_error`

Conversões Meta do site:

- `page_view` → `PageView`
- `view_item` → `ViewContent`
- `property_search` e `sara_results` → `Search`
- `generate_lead` → `Lead`
- `whatsapp_click` e `phone_click` → `Contact`
- `favorite_toggle` → `AddToWishlist`
- `schedule_complete` → `Schedule`
- intenções intermediárias usam eventos customizados; nunca viram `Lead` antes do envio concluído.

Conversões Meta do CRM, em ordem de qualidade:

- primeira mensagem recebida do lead no WhatsApp ou momento real `respondeu` → `LeadRespondeu`
- momento real `qualificando` → `QualificacaoIniciada`
- conclusão comprovada da qualificação, registrada explicitamente pelo fluxo comercial → `LeadQualificado`
- visita com status agendada → `Schedule`
- visita com status realizada → `VisitaRealizada`
- proposta criada → `PropostaEnviada`
- venda concluída/paga → `Purchase`, com VGV e BRL

Cada envio inclui `stage_event`, `funnel_stage` e `stage_rank`, além da atribuição disponível de campanha, conjunto, anúncio e criativo. O antigo número de etapa 68 não é tratado como qualificação: no banco ele significa “Em atendimento”.

Quando o lead nasceu em formulário instantâneo da Meta, `meta_lead_id` também é enviado como `user_data.lead_id`, o campo oficial de correspondência da Conversions API. E-mail e telefone hasheados continuam como sinais complementares.

`LeadRespondeu` significa exclusivamente uma mensagem de entrada enviada pelo próprio lead. O evento leva `response_actor: lead` e `message_direction: inbound`. Mensagens de saída do corretor (`out`, `saida`, `enviada` ou `sent`) são descartadas pelo gatilho e não geram esse evento.

## Atribuição que acompanha o lead

- first touch e last touch
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- `campaign_id`, `adset_id`, `ad_group_id`, `ad_id`, `creative_id`, `placement`
- `gclid`, `gbraid`, `wbraid`, `fbclid`, `_fbp`, `_fbc` quando houver consentimento aplicável
- landing path, referrer, page view ID, sessão consentida, GA client/session ID
- empreendimento, unidade/contexto, tipo do lead e preferência de visita

## Limite de consentimento

O banco first-party mede page views, caminhos, cliques e abandonos de forma anônima e sem cookie mesmo no nível essencial. Analytics/Clarity exigem aceite de Analytics. Meta Pixel, CAPI de navegador, Google Ads e identificadores publicitários persistentes exigem marketing aceito. Sem esse aceite, a ApêCerto ainda enxerga o comportamento agregado, mas não deve criar audiência individual na plataforma de anúncio.

## Regras para a UI de Inteligência

- Nunca usar números demo quando o RPC responder vazio; mostrar zero, “sem dados” ou “aguardando coleta”.
- Todo KPI deve abrir o recorte que o compõe.
- Mostrar atualização, período e nível de consentimento.
- Separar `Lead` de intenção intermediária.
- Exibir saúde da Meta por recibo: entregue, pendente, falhou, motivo e última tentativa.
- Campanhas devem ordenar por resultado comercial, não só por clique.
- Imóveis devem mostrar a sequência visualização → galeria → contato → lead → visita → proposta → venda quando houver vínculo no CRM.

## Prompt curto para o chat que implementa a Inteligência

> Conecte as telas de Inteligência aos RPCs autenticados `tracking_360_dashboard(p_days)` e `tracking_360_attribution_scope(p_days)`. Preserve integralmente o design já aprovado. Substitua dados demo pelas seções reais retornadas pelos dois contratos. Não leia tabelas privadas diretamente e não exponha PII. Mantenha filtros de período no parâmetro `p_days`, estados loading/empty/error e drill-down coerente. “Lead” significa somente envio concluído; intenção, formulário iniciado, WhatsApp e agendamento iniciado permanecem métricas separadas. A saúde da Meta deve vir dos recibos de entrega, e não de inferência visual.
