# Tracking da campanha de captação de proprietários

## Página de destino

`https://apecerto.com/proprietario/cadastre-seu-imovel/`

## URL para anúncios da Meta

```text
https://apecerto.com/proprietario/cadastre-seu-imovel/?utm_source=meta&utm_medium=paid_social&utm_campaign=captacao_proprietarios_moema&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}
```

## URL para anúncios do Google

Use o acompanhamento automático (`gclid`) e mantenha os parâmetros abaixo no sufixo da URL final:

```text
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}&campaign_id={campaignid}&ad_group_id={adgroupid}&ad_id={creative}
```

## O que cada etapa significa

| Etapa | Evento | É conversão? |
| --- | --- | --- |
| Abriu a página | `page_view` | Não |
| Começou o formulário | `form_start` | Não |
| Clicou em anunciar | `owner_cta_click` | Não |
| Enviou nome e WhatsApp com sucesso | `generate_lead` | Sim |
| Clicou no WhatsApp depois do envio | `whatsapp_click` | Contato, não novo lead |
| Lead entrou no CRM | `site_leads` → `leads`/`negocios` | Sim, operacional |

Somente `generate_lead` alimenta a conversão `Lead` da Meta e a ação principal “Enviar formulário de lead” do Google Ads. Pixel e CAPI usam o mesmo `event_id` para deduplicação.

## Onde conferir

- Microsoft Clarity: gravações, mapa de calor, rolagem, cliques mortos e tempo ativo.
- GA4 “ApeCerto - Site”: sessões, origem/mídia, páginas, eventos e `generate_lead`.
- Google Ads: conversão principal “Enviar formulário de lead”.
- Meta Events Manager: `PageView`, `ViewContent`, `Search`, `Contact`, `Schedule` e `Lead`.
- Supabase/CRM: primeiro toque, último toque, UTM, IDs de campanha/anúncio e vínculo com lead/negócio.

## Privacidade

Sem aceite, a ApeCerto mantém apenas telemetria first-party minimizada da página atual, sem cookie de identificação. Analytics, gravações, remarketing, Pixel/CAPI e persistência entre visitas só são ativados de acordo com a escolha do visitante. A página oferece acesso permanente a “Preferências de privacidade”.
