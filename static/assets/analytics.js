(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-P63KVXKJDH';
  var CLARITY_ID = 'y3rdh7jjn5';
  var PIXEL_ID = '1088080836200357';
  var GOOGLE_ADS_ID = 'AW-18389793678';
  var ADS_CONVERSION_LABELS = {
    generate_lead: 'anMDCOmFieQcEI7398BE'
  };
  var SUPABASE_URL = 'https://diaegvfveqezispcthwk.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpYWVndmZ2ZXFlemlzcGN0aHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5OTU4MjIsImV4cCI6MjA5ODU3MTgyMn0.312n8BuI-loQrQ20x9j1hNjKZs2UO71ey9gvIo0eY0I';
  var CAPI_URL = SUPABASE_URL + '/functions/v1/meta-capi';
  var CONSENT_KEY = 'apecerto_consent_v2';
  var LEGACY_CONSENT_KEY = 'apecerto_consent_v1';
  var ATTRIBUTION_KEY = 'apecerto_attribution_v3';
  var LEGACY_ATTRIBUTION_KEY = 'apecerto_attribution_v2';
  var SESSION_KEY = 'apecerto_session_v1';
  var pageViewId = makeUuid();
  var sessionId = '';
  var googleIdentity = { client_id: '', session_id: '' };
  var googleLoaded = false;
  var clarityLoaded = false;
  var pixelLoaded = false;
  var marketingPageViewSent = false;
  var googleAdsLoaded = false;
  var consent = { analytics: false, marketing: false };
  var currentTouch = readCurrentTouch();

  // Mapa evento interno -> evento padrao da Meta. Espelha a Edge Function meta-capi.
  var META_EVENT_MAP = {
    page_view: 'PageView',
    view_item: 'ViewContent',
    property_search: 'Search',
    sara_results: 'Search',
    generate_lead: 'Lead',
    whatsapp_click: 'Contact',
    phone_click: 'Contact',
    favorite_toggle: 'AddToWishlist',
    schedule_complete: 'Schedule',
    form_start: 'FormStart',
    owner_cta_click: 'OwnerIntent',
    financing_open: 'FinancingStart',
    schedule_start: 'ScheduleStart',
    gallery_interaction: 'GalleryInteraction'
  };
  var META_CUSTOM_EVENTS = new Set([
    'form_start', 'owner_cta_click', 'financing_open',
    'schedule_start', 'gallery_interaction'
  ]);
  var lastViewedItemId = '';
  var lastViewedItemName = '';

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });

  function makeUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (character) {
      var random = Math.random() * 16 | 0;
      return (character === 'x' ? random : (random & 3 | 8)).toString(16);
    });
  }

  function clean(value, max) {
    var raw = String(value == null ? '' : value);
    var out = '';
    for (var i = 0; i < raw.length; i++) {
      var code = raw.charCodeAt(i);
      out += (code < 32 || code === 127) ? ' ' : raw.charAt(i);
    }
    return out.replace(/\s+/g, ' ').trim().slice(0, max || 120);
  }

  function pagePath() {
    return clean(location.pathname || '/', 240) || '/';
  }

  function referrerHost() {
    if (!document.referrer) return '';
    try { return clean(new URL(document.referrer).hostname, 160); } catch (e) { return ''; }
  }

  function deviceCategory() {
    var width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    if (width && width < 768) return 'mobile';
    if (width && width < 1100) return 'tablet';
    return width ? 'desktop' : 'unknown';
  }

  function consentLevel() {
    return consent.marketing ? 'marketing' : (consent.analytics ? 'analytics' : 'essential');
  }

  function readCookie(name) {
    var match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return match ? match.pop() : '';
  }

  function getFbp() {
    return consent.marketing ? (readCookie('_fbp') || '') : '';
  }

  function getFbc() {
    if (!consent.marketing) return '';
    var stored = readCookie('_fbc');
    if (stored) return stored;
    var attribution = readAttributionStoreRaw();
    var touch = currentTouch.fbclid
      ? currentTouch
      : ((attribution.last && attribution.last.fbclid) ? attribution.last : attribution.first);
    if (touch && touch.fbclid) {
      var capturedAt = Date.parse(touch.captured_at || '') || Date.now();
      return 'fb.1.' + Math.floor(capturedAt / 1000) + '.' + touch.fbclid;
    }
    return '';
  }

  function readCurrentTouch() {
    var query = new URLSearchParams(location.search);
    var keys = [
      'gclid', 'gbraid', 'wbraid', 'fbclid',
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'campaign_id', 'adset_id', 'ad_group_id', 'ad_id', 'creative_id', 'placement'
    ];
    var data = { landing_path: pagePath(), captured_at: new Date().toISOString() };
    keys.forEach(function (key) {
      var value = clean(query.get(key), 200);
      if (value) data[key] = value;
    });
    var host = referrerHost();
    if (host) data.referrer_host = host;
    return data;
  }

  function attributionForStorage() {
    return touchForConsent(currentTouch);
  }

  function touchForConsent(value) {
    var data = Object.assign({}, value || {});
    if (!consent.marketing) {
      delete data.gclid;
      delete data.gbraid;
      delete data.wbraid;
      delete data.fbclid;
    }
    return data;
  }

  function hasAcquisitionSignal(touch) {
    if (!touch) return false;
    return !!(
      touch.gclid || touch.gbraid || touch.wbraid || touch.fbclid ||
      touch.utm_source || touch.utm_medium || touch.utm_campaign ||
      touch.utm_term || touch.utm_content || touch.campaign_id ||
      touch.adset_id || touch.ad_group_id || touch.ad_id || touch.creative_id
    );
  }

  function readAttributionStoreRaw() {
    try {
      var parsed = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || 'null');
      if (!parsed) parsed = JSON.parse(localStorage.getItem(LEGACY_ATTRIBUTION_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }

  function persistAttribution() {
    if (!consent.analytics && !consent.marketing) return;
    try {
      var stored = readAttributionStoreRaw();
      var touch = attributionForStorage();
      var first = stored.first || touch;
      var last = hasAcquisitionSignal(touch) ? touch : (stored.last || touch);
      localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({
        version: 3,
        first: touchForConsent(first),
        last: touchForConsent(last),
        updated_at: new Date().toISOString(),
      }));
    } catch (e) {}
  }

  function readStoredAttribution() {
    if (!consent.analytics && !consent.marketing) return {};
    var stored = readAttributionStoreRaw();
    return {
      first: touchForConsent(stored.first),
      last: touchForConsent(stored.last),
    };
  }

  function ensureSessionId() {
    if (!consent.analytics) return '';
    if (sessionId) return sessionId;
    try {
      sessionId = sessionStorage.getItem(SESSION_KEY) || '';
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(sessionId)) {
        sessionId = makeUuid();
        sessionStorage.setItem(SESSION_KEY, sessionId);
      }
    } catch (e) { sessionId = makeUuid(); }
    return sessionId;
  }

  function refreshGoogleIdentity() {
    if (!consent.analytics || !window.gtag) return;
    ensureSessionId();
    window.gtag('get', MEASUREMENT_ID, 'client_id', function (value) {
      googleIdentity.client_id = clean(value, 120);
    });
    window.gtag('get', MEASUREMENT_ID, 'session_id', function (value) {
      googleIdentity.session_id = clean(value, 120);
    });
  }

  function loadGoogleTag() {
    if (googleLoaded) return;
    googleLoaded = true;
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(script);
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      send_page_view: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  }

  // Google Ads: ativa a tag de anuncios (remarketing + gclid + enhanced conversions)
  // somente com consentimento de marketing.
  function loadGoogleAds() {
    if (googleAdsLoaded) return;
    googleAdsLoaded = true;
    window.gtag('config', GOOGLE_ADS_ID, { allow_enhanced_conversions: true });
  }

  // Dispara a conversao do Google Ads quando ha um label mapeado para o evento.
  function adsConversion(eventName, params, eventId) {
    if (!consent.marketing || !googleAdsLoaded) return;
    var label = ADS_CONVERSION_LABELS[eventName];
    if (!label) return;
    var data = {
      send_to: GOOGLE_ADS_ID + '/' + label,
      transaction_id: clean(eventId, 120),
    };
    if (params && typeof params.value === 'number') { data.value = params.value; data.currency = params.currency || 'BRL'; }
    window.gtag('event', 'conversion', data);
  }

  function loadClarity() {
    if (clarityLoaded) return;
    clarityLoaded = true;
    window.clarity = window.clarity || function () {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.clarity.ms/tag/' + encodeURIComponent(CLARITY_ID);
    document.head.appendChild(script);
    window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
  }

  function loadMetaPixel() {
    if (pixelLoaded) return;
    pixelLoaded = true;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
  }

  // Envia o evento para a Conversions API (server-side) com o mesmo event_id do Pixel.
  function capiSend(eventName, params, eventId, identity) {
    if (!consent.marketing) return;
    if (!META_EVENT_MAP[eventName]) return;
    var body = {
      event_name: eventName,
      event_id: eventId,
      event_source_url: location.href,
      event_time: Math.floor(Date.now() / 1000),
      consent_marketing: true,
      custom_data: params || {},
    };
    var fbp = getFbp();
    var fbc = getFbc();
    if (fbp) body.fbp = fbp;
    if (fbc) body.fbc = fbc;
    if (identity && identity.email) body.email = clean(identity.email, 160);
    if (identity && identity.phone) body.phone = clean(identity.phone, 40);
    if (identity && identity.external_id) body.external_id = clean(identity.external_id, 120);
    fetch(CAPI_URL, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).catch(function () {});
  }

  // Pixel e CAPI recebem o mesmo event_id publicado no dataLayer, permitindo
  // deduplicacao. O GTM observa o contrato sem ser ponto unico de falha.
  function metaTrack(eventName, params, eventId, identity) {
    if (!consent.marketing) return;
    var metaEvent = META_EVENT_MAP[eventName];
    if (!metaEvent) return;
    if (pixelLoaded && window.fbq) {
      window.fbq(META_CUSTOM_EVENTS.has(eventName) ? 'trackCustom' : 'track', metaEvent, params || {}, { eventID: eventId });
    }
    capiSend(eventName, params || {}, eventId, identity || null);
  }

  function marketingPageView() {
    if (!consent.marketing || marketingPageViewSent) return;
    marketingPageViewSent = true;
    var eventId = makeUuid();
    var payload = {
      event: 'apecerto_event',
      apecerto_event_name: 'page_view',
      apecerto_event_id: eventId,
      page_location: location.href,
      event_id: eventId,
    };
    window.dataLayer.push(payload);
    if (pixelLoaded && window.fbq) window.fbq('track', 'PageView', {}, { eventID: eventId });
    capiSend('page_view', {}, eventId);
  }

  function applyConsent(next) {
    consent = {
      analytics: !!(next && next.analytics),
      marketing: !!(next && next.marketing),
    };
    if (consent.marketing) consent.analytics = true;
    window.apecertoConsentState = Object.assign({}, consent);
    window.gtag('consent', 'update', {
      ad_storage: consent.marketing ? 'granted' : 'denied',
      analytics_storage: consent.analytics ? 'granted' : 'denied',
      ad_user_data: consent.marketing ? 'granted' : 'denied',
      ad_personalization: consent.marketing ? 'granted' : 'denied',
    });
    window.gtag('config', MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: consent.marketing,
      allow_ad_personalization_signals: consent.marketing,
    });
    if (consent.analytics) {
      ensureSessionId();
      persistAttribution();
      refreshGoogleIdentity();
      setTimeout(refreshGoogleIdentity, 1200);
      loadClarity();
    } else if (clarityLoaded && window.clarity) {
      window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    }
    if (consent.marketing) {
      loadMetaPixel();
      loadGoogleAds();
      marketingPageView();
    }
  }

  function saveConsent(next) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(next)); } catch (e) {}
  }

  function restoreConsent() {
    try {
      var parsed = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
      if (parsed && typeof parsed.analytics === 'boolean' && typeof parsed.marketing === 'boolean') return parsed;
      var legacy = localStorage.getItem(LEGACY_CONSENT_KEY);
      if (legacy === 'accepted') return { analytics: true, marketing: false };
      if (legacy === 'rejected') return { analytics: false, marketing: false };
    } catch (e) {}
    return null;
  }

  function firstPartyTrack(eventName, params) {
    var properties = Object.assign({}, params || {});
    var attribution = readStoredAttribution();
    var campaignTouch = attribution.last && Object.keys(attribution.last).length
      ? attribution.last
      : currentTouch;
    if (campaignTouch) {
      ['campaign_id', 'adset_id', 'ad_group_id', 'ad_id', 'creative_id', 'placement'].forEach(function (key) {
        if (campaignTouch[key]) properties[key] = campaignTouch[key];
      });
    }
    var body = {
      page_view_id: pageViewId,
      session_id: consent.analytics ? ensureSessionId() : null,
      event_name: clean(eventName, 60),
      page_path: pagePath(),
      referrer_host: referrerHost() || null,
      device_category: deviceCategory(),
      consent_level: consentLevel(),
      utm_source: clean(currentTouch.utm_source, 120) || null,
      utm_medium: clean(currentTouch.utm_medium, 120) || null,
      utm_campaign: clean(currentTouch.utm_campaign, 160) || null,
      properties: properties,
    };
    fetch(SUPABASE_URL + '/functions/v1/site-track', {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).catch(function () {});
  }

  window.apecertoTrack = function (eventName, params) {
    var sourceParams = params && typeof params === 'object' ? params : {};
    var identity = sourceParams.__identity && typeof sourceParams.__identity === 'object'
      ? sourceParams.__identity
      : null;
    var publicParams = Object.assign({}, sourceParams);
    delete publicParams.__identity;
    if (eventName === 'view_item') {
      var nextItem = clean(publicParams.item_id, 100);
      if (lastViewedItemId && nextItem && lastViewedItemId !== nextItem) publicParams.from_item_id = lastViewedItemId;
      if (nextItem) {
        lastViewedItemId = nextItem;
        lastViewedItemName = clean(publicParams.item_name, 160);
        window.apecertoCurrentItem = { id: lastViewedItemId, name: lastViewedItemName };
      }
    }
    var currentItem = window.apecertoCurrentItem && typeof window.apecertoCurrentItem === 'object'
      ? window.apecertoCurrentItem
      : null;
    if (currentItem && currentItem.id && !publicParams.item_id && /^(gallery_interaction|favorite_toggle|whatsapp_click|phone_click|schedule_start|schedule_field_select|financing_open|financing_change|form_start|form_submit_attempt|form_error)$/.test(eventName)) {
      publicParams.item_id = clean(currentItem.id, 100);
      if (currentItem.name) publicParams.item_name = clean(currentItem.name, 160);
    }
    var eventId = makeUuid();
    var payload = Object.assign({ page_location: location.href, event_id: eventId }, publicParams);
    var attribution = readStoredAttribution();
    var campaignTouch = attribution.last && Object.keys(attribution.last).length
      ? attribution.last
      : currentTouch;
    if (campaignTouch) {
      ['campaign_id', 'adset_id', 'ad_group_id', 'ad_id', 'creative_id', 'placement'].forEach(function (key) {
        if (campaignTouch[key] && !payload[key]) payload[key] = campaignTouch[key];
      });
    }
    if (attribution.first && attribution.first.utm_campaign) payload.utm_campaign_first = attribution.first.utm_campaign;
    if (attribution.last && attribution.last.utm_campaign) payload.utm_campaign_last = attribution.last.utm_campaign;
    if (consent.analytics && ensureSessionId()) payload.apecerto_session_id = sessionId;
    if (consent.analytics && googleIdentity.client_id) payload.ga_client_id = googleIdentity.client_id;
    if (consent.analytics && googleIdentity.session_id) payload.ga_session_id = googleIdentity.session_id;
    if (consent.marketing && ((attribution.first && attribution.first.gclid) || currentTouch.gclid)) payload.has_gclid = true;
    firstPartyTrack(eventName, Object.assign({ event_id: eventId }, publicParams));
    window.dataLayer.push(Object.assign({
      event: 'apecerto_event',
      apecerto_event_name: eventName,
      apecerto_event_id: eventId,
    }, payload));
    window.gtag('event', eventName, payload);
    metaTrack(eventName, publicParams, eventId, identity);
    if (identity && consent.marketing) {
      window.gtag('set', 'user_data', {
        email: identity.email || undefined,
        phone_number: identity.phone || undefined,
      });
    }
    adsConversion(eventName, publicParams, eventId);
    if (clarityLoaded && window.clarity && /^(generate_lead|view_item|whatsapp_click|phone_click|sara_results|owner_portal_open)$/.test(eventName)) {
      window.clarity('event', eventName);
    }
  };

  window.apecertoLeadTracking = function () {
    var stored = readStoredAttribution();
    var current = touchForConsent(currentTouch);
    var first = stored.first && Object.keys(stored.first).length ? stored.first : current;
    var last = stored.last && Object.keys(stored.last).length ? stored.last : current;
    var identity = {
      page_view_id: pageViewId,
      session_id: consent.analytics ? ensureSessionId() : null,
      ga_client_id: consent.analytics ? (googleIdentity.client_id || null) : null,
      ga_session_id: consent.analytics ? (googleIdentity.session_id || null) : null,
      fbp: consent.marketing ? (getFbp() || null) : null,
      fbc: consent.marketing ? (getFbc() || null) : null,
    };
    return {
      version: 2,
      page_view_id: pageViewId,
      session_id: identity.session_id,
      landing_path: first.landing_path || pagePath(),
      current_path: pagePath(),
      referrer_host: first.referrer_host || referrerHost() || null,
      consent: { analytics: consent.analytics, marketing: consent.marketing },
      identity: identity,
      attribution: { first: first, last: last, current: current },
    };
  };

  // Porta unica para todos os leads publicos. O navegador envia somente contato,
  // contexto comercial permitido e a atribuicao consentida — nunca documentos.
  window.apecertoSubmitSiteLead = async function (input) {
    var source = input && typeof input === 'object' ? input : {};
    var leadType = /^(comprador|proprietario|financiamento)$/.test(source.lead_type)
      ? source.lead_type
      : 'comprador';
    var allowedContext = [
      'empreendimento_id', 'empreendimento_nome', 'preferencia_horario',
      'captacao_id', 'finalidade', 'bairro', 'cidade', 'area_util',
      'valor_imovel', 'percentual_financiado', 'valor_entrada',
      'valor_financiar', 'renda_mensal', 'estado_civil', 'objetivo',
      'tipo_imovel', 'source'
    ];
    var context = {};
    var rawContext = source.context && typeof source.context === 'object' ? source.context : {};
    allowedContext.forEach(function (key) {
      var value = rawContext[key];
      if (value !== undefined && value !== null && value !== '') context[key] = value;
    });
    var tracking = window.apecertoLeadTracking ? window.apecertoLeadTracking() : {};
    var body = {
      nome: clean(source.nome, 120),
      telefone: clean(source.telefone, 40),
      email: clean(source.email, 254) || null,
      origem: 'site',
      lead_type: leadType,
      empreendimento_id: source.empreendimento_id || null,
      empreendimento_nome: clean(source.empreendimento_nome, 200) || null,
      preferencia_horario: clean(source.preferencia_horario, 200) || null,
      page_view_id: tracking.page_view_id || null,
      tracking: tracking,
      context: context,
    };
    window.apecertoTrack('form_submit_attempt', {
      form_context: leadType,
      item_id: body.empreendimento_id ? String(body.empreendimento_id) : '',
      item_name: body.empreendimento_nome || '',
    });
    if (!body.nome || !body.telefone) {
      window.apecertoTrack('form_error', { form_context: leadType, error_type: 'contact_required' });
      throw new Error('contact_required');
    }
    var response = await fetch(SUPABASE_URL + '/rest/v1/site_leads', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      window.apecertoTrack('form_error', { form_context: leadType, error_type: 'lead_http_' + response.status });
      throw new Error('lead_http_' + response.status);
    }
    return true;
  };

  function addConsentBanner() {
    var existing = document.getElementById('apecerto-consent');
    if (existing) existing.remove();
    var banner = document.createElement('section');
    banner.id = 'apecerto-consent';
    banner.setAttribute('aria-label', 'Preferências de privacidade');
    banner.innerHTML = '<div><strong>Você escolhe como medimos.</strong><p>A medição anônima essencial não usa cookies nem tenta identificar você. Com Analytics, liberamos estatísticas, mapas de calor e gravações mascaradas. Marketing também permite atribuição e personalização de anúncios.</p><a href="/privacidade/">Política de privacidade</a></div><div class="apecerto-consent-actions"><button type="button" data-consent="essential">Somente essenciais</button><button type="button" data-consent="analytics">Aceitar Analytics</button><button type="button" data-consent="all" class="primary">Aceitar tudo</button></div>';
    banner.addEventListener('click', function (event) {
      var button = event.target.closest('[data-consent]');
      if (!button) return;
      var choice = button.getAttribute('data-consent');
      var next = choice === 'all'
        ? { analytics: true, marketing: true }
        : choice === 'analytics'
        ? { analytics: true, marketing: false }
        : { analytics: false, marketing: false };
      saveConsent(next);
      applyConsent(next);
      banner.remove();
      window.apecertoTrack('consent_update', { consent_choice: choice });
    });
    document.body.appendChild(banner);
  }

  window.apecertoOpenConsent = addConsentBanner;

  function addConsentSettingsButton() {
    if (document.getElementById('apecerto-consent-settings')) return;
    var button = document.createElement('button');
    button.id = 'apecerto-consent-settings';
    button.type = 'button';
    button.textContent = 'Preferências de privacidade';
    button.setAttribute('aria-label', 'Reabrir preferências de privacidade');
    button.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147482999;border:1px solid rgba(31,28,26,.18);border-radius:999px;background:#fff;color:#4a4541;padding:8px 12px;font:600 12px/1.2 Quicksand,Arial,sans-serif;box-shadow:0 2px 10px rgba(31,28,26,.12);cursor:pointer';
    button.addEventListener('click', addConsentBanner);
    document.body.appendChild(button);
  }

  function cleanLabel(value) {
    return clean(value, 80);
  }

  // Rastreia profundidade de rolagem. O site e uma SPA cujo scroller e o
  // document.body (window.scrollY/documentElement ficam em 0), entao pegamos o
  // maior percentual entre body, scrollingElement, janela e o alvo do evento.
  function trackScrollDepth() {
    var sent = {};
    var points = [25, 50, 75, 90];
    function pct(el) {
      if (!el) return 0;
      var denom = Math.max(el.scrollHeight - el.clientHeight, 1);
      return Math.round(((el.scrollTop || 0) / denom) * 100);
    }
    function measure(event) {
      var d = document.documentElement;
      var winPct = Math.round(((window.scrollY || 0) / Math.max(d.scrollHeight - window.innerHeight, 1)) * 100);
      var percent = Math.max(pct(document.body), pct(document.scrollingElement || d), winPct);
      var target = event && event.target;
      if (target && target.nodeType === 1 && typeof target.scrollHeight === 'number') {
        percent = Math.max(percent, pct(target));
      }
      points.forEach(function (point) {
        if (percent >= point && !sent[point]) {
          sent[point] = true;
          window.apecertoTrack('scroll_depth', { percent_scrolled: point });
        }
      });
    }
    document.addEventListener('scroll', measure, true);
    window.addEventListener('scroll', measure, { passive: true });
  }

  function formContext(field) {
    var explicit = field.closest('[data-tracking-form],[data-tracking-context]');
    if (explicit) {
      var declared = cleanLabel(explicit.getAttribute('data-tracking-form') || explicit.getAttribute('data-tracking-context')).toLowerCase();
      if (/^(agendamento|financiamento|proprietario|lead|portal_login|busca)$/.test(declared)) return declared;
    }
    var name = cleanLabel(field.getAttribute('name')).toLowerCase();
    var placeholder = cleanLabel(field.getAttribute('placeholder')).toLowerCase();
    if (/o que você procura|o que voce procura/.test(placeholder)) return 'sara';
    var surroundings = cleanLabel((field.closest('[data-clarity-mask],form,[role="dialog"]') || field.parentElement || field).textContent).toLowerCase();
    if (/cpf|rg|renda|nascimento/.test(name + ' ' + placeholder) || /financiamento|simulação|simulacao/.test(surroundings)) return 'financiamento';
    if (/agendar visita|escolha.*dia|horário|horario/.test(surroundings)) return 'agendamento';
    if (/anunciar.*apê|anunciar.*ape|captar.*imóvel|captar.*imovel|proprietário|proprietario/.test(surroundings)) return 'proprietario';
    if (/senha/.test(name)) return 'portal_login';
    if (/telefone|email|nome/.test(name)) return 'lead';
    return 'busca';
  }

  function bindAutomaticEvents() {
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href]');
      if (link) {
        var href = link.getAttribute('href') || '';
        if (/wa\.me|api\.whatsapp\.com/i.test(href)) {
          window.apecertoTrack('whatsapp_click', { source: 'link', action_label: cleanLabel(link.innerText) });
        } else if (/^tel:/i.test(href)) {
          window.apecertoTrack('phone_click', { source: 'link' });
        } else if (/instagram\.com/i.test(href)) {
          window.apecertoTrack('social_click', { social_network: 'instagram' });
        }
      }

      var button = event.target.closest('button,[role="button"]');
      if (!button) return;
      var label = cleanLabel(button.getAttribute('aria-label') || button.innerText);
      if (/Buscar com a Sara/i.test(label)) {
        window.apecertoTrack('sara_open', { source: 'hero' });
      } else if (/buscar apê|buscar ape/i.test(label)) {
        window.apecertoTrack('property_search', { source: 'hero' });
      } else if (/agendar visita|melhor dia|pedir visita/i.test(label)) {
        window.apecertoTrack('schedule_start', { cta_name: 'agendar_visita' });
      } else if (/simular financiamento|financiamento/i.test(label)) {
        window.apecertoTrack('financing_open', { cta_name: 'simular_financiamento' });
      } else if (/anunciar meu apê|anunciar meu ape/i.test(label)) {
        window.apecertoTrack('owner_cta_click', { source: 'site' });
      }
    }, true);

    var started = {};
    document.addEventListener('focusin', function (event) {
      var field = event.target.closest('input,textarea,select');
      if (!field) return;
      var context = formContext(field);
      if (context === 'sara' || started[context]) return;
      started[context] = true;
      window.apecertoTrack('form_start', { form_context: context });
    }, true);

    document.addEventListener('change', function (event) {
      var field = event.target.closest('select,input[type="range"]');
      if (!field) return;
      var type = field.tagName === 'SELECT' ? 'select' : 'price_range';
      window.apecertoTrack('filter_change', { filter_type: type });
      var context = formContext(field);
      if (context === 'agendamento' && /date|time/.test(field.type || '')) {
        window.apecertoTrack('schedule_field_select', { form_context: context, field_name: cleanLabel(field.name || field.type) });
      } else if (context === 'financiamento') {
        window.apecertoTrack('financing_change', { form_context: context, field_name: cleanLabel(field.name || field.type) });
      }
    }, true);
  }

  function trackEngagement() {
    var activeSeconds = 0;
    var sent = {};
    var thresholds = [15, 30, 60, 120, 300];
    var exited = false;
    setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      activeSeconds += 1;
      thresholds.forEach(function (seconds) {
        if (activeSeconds >= seconds && !sent[seconds]) {
          sent[seconds] = true;
          window.apecertoTrack('engagement_time', { engagement_seconds: seconds });
        }
      });
    }, 1000);
    window.addEventListener('pagehide', function () {
      if (exited) return;
      exited = true;
      window.apecertoTrack('page_exit', { engagement_seconds: activeSeconds });
    });
  }

  loadGoogleTag();
  var storedConsent = restoreConsent();
  if (storedConsent) applyConsent(storedConsent);
  bindAutomaticEvents();
  trackScrollDepth();
  trackEngagement();
  firstPartyTrack('page_view', {});

  function trackingReady() {
    addConsentSettingsButton();
    if (!storedConsent) addConsentBanner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', trackingReady);
  else trackingReady();
})();
