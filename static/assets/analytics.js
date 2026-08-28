(function () {
  'use strict';

  var TRACKING_CONFIG = window.APECERTO_TRACKING_CONFIG && typeof window.APECERTO_TRACKING_CONFIG === 'object'
    ? window.APECERTO_TRACKING_CONFIG
    : {};
  var MEASUREMENT_ID = 'G-P63KVXKJDH';
  var CLARITY_ID = 'y3rdh7jjn5';
  var PIXEL_ID = '1088080836200357';
  var GOOGLE_ADS_ID = 'AW-18389793678';
  // Mantém os labels homologados e permite sobrescrita explícita pelo deploy.
  var ADS_CONVERSION_LABELS = {
    generate_lead: 'anMDCOmFieQcEI7398BE'
  };
  var configuredAdsConversionLabels = TRACKING_CONFIG.google_ads_conversion_labels &&
    typeof TRACKING_CONFIG.google_ads_conversion_labels === 'object'
    ? TRACKING_CONFIG.google_ads_conversion_labels
    : {};
  Object.keys(configuredAdsConversionLabels).forEach(function (eventName) {
    ADS_CONVERSION_LABELS[eventName] = configuredAdsConversionLabels[eventName];
  });
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
    owner_cta_click: 'OwnerIntent',
    whatsapp_click: 'Contact',
    phone_click: 'Contact',
    favorite_toggle: 'AddToWishlist',
    schedule_complete: 'Schedule',
    form_start: 'FormStart',
    financing_open: 'FinancingStart',
    schedule_start: 'ScheduleStart',
    gallery_interaction: 'GalleryInteraction'
  };
  var META_CUSTOM_EVENTS = new Set([
    'form_start', 'owner_cta_click', 'financing_open',
    'schedule_start', 'gallery_interaction'
  ]);
  var ATTRIBUTION_EVENT_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'campaign_id', 'adset_id', 'ad_group_id', 'ad_id', 'creative_id',
    'form_id', 'placement', 'tracking_ref'
  ];
  var lastViewedItemId = '';
  var lastViewedItemName = '';
  var financingRequestId = '';

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

  function normalizeEmailForAds(value) {
    var email = clean(value, 254).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  function normalizePhoneForAds(value) {
    var digits = String(value == null ? '' : value).replace(/\D/g, '');
    if (digits.indexOf('00') === 0) digits = digits.slice(2);
    if (/^[1-9]\d{9,10}$/.test(digits)) digits = '55' + digits;
    return /^55[1-9]\d{9,10}$/.test(digits) ? '+' + digits : '';
  }

  function privacySafeEventParams(value) {
    var result = {};
    var blocked = {
      email: true, 'e-mail': true, telefone: true, phone: true, phone_number: true,
      nome: true, name: true, full_name: true, cpf: true, rg: true,
      endereco: true, address: true, cep: true, postal_code: true,
      renda: true, income: true,
    };
    Object.keys(value || {}).forEach(function (key) {
      if (key !== '__identity' && !blocked[String(key).toLowerCase()]) result[key] = value[key];
    });
    return result;
  }

  function uuidOrNull(value) {
    var normalized = clean(value, 36);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
      ? normalized
      : null;
  }

  function pagePath() {
    return clean(location.pathname || '/', 240) || '/';
  }

  function safePageUrl() {
    try {
      var url = new URL(location.href);
      url.hash = '';
      var blocked = {
        access_token: true, refresh_token: true, token: true, token_hash: true,
        code: true, error: true, error_code: true, error_description: true,
        email: true, 'e-mail': true, telefone: true, phone: true, phone_number: true,
        nome: true, name: true, cpf: true, rg: true, endereco: true, address: true,
        cep: true, postal_code: true, renda: true, income: true,
      };
      Array.from(url.searchParams.keys()).forEach(function (key) {
        if (blocked[String(key).toLowerCase()]) url.searchParams.delete(key);
      });
      return url.origin + url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '');
    } catch (e) {
      return clean(location.origin, 180) + pagePath();
    }
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
      'utm_id', 'campaign_id', 'adset_id', 'ad_group_id', 'ad_id', 'creative_id',
      'form_id', 'placement', 'tracking_ref'
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
      touch.adset_id || touch.ad_group_id || touch.ad_id || touch.creative_id ||
      touch.form_id || touch.tracking_ref
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

  function clearStoredTrackingIdentity() {
    try {
      localStorage.removeItem(ATTRIBUTION_KEY);
      localStorage.removeItem(LEGACY_ATTRIBUTION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    sessionId = '';
    googleIdentity = { client_id: '', session_id: '' };
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
      page_location: safePageUrl(),
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  }

  function gtmContainerReady() {
    return !!(
      window.apecertoGtmContainerLoaded ||
      (window.google_tag_manager && window.google_tag_manager['GTM-524TZP8X'])
    );
  }

  function scheduleGoogleTagFallback() {
    // O contêiner oficial é a fonte principal. A tag direta só entra se a
    // requisição do GTM realmente falhar ou continuar ausente após 15 segundos.
    window.apecertoLoadGoogleFallback = function () {
      if (!gtmContainerReady()) loadGoogleTag();
    };
    window.setTimeout(function () {
      if (!gtmContainerReady() && (window.apecertoGtmLoadFailed || !window.apecertoGtmLoading)) loadGoogleTag();
    }, 15000);
  }

  function requestGtmNow() {
    if (typeof window.apecertoLoadGtm === 'function') window.apecertoLoadGtm();
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
    if (!consent.marketing || !googleAdsLoaded) return Promise.resolve(false);
    var label = clean(ADS_CONVERSION_LABELS[eventName], 120);
    if (!/^[A-Za-z0-9_-]+$/.test(label)) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var settled = false;
      var finish = function (sent) {
        if (settled) return;
        settled = true;
        resolve(sent);
      };
      // Evita que um redirecionamento imediato (por exemplo, para o WhatsApp)
      // cancele o beacon antes de o Google Ads confirmar o recebimento.
      setTimeout(function () { finish(false); }, 1800);
      var data = {
        send_to: GOOGLE_ADS_ID + '/' + label,
        transaction_id: clean(eventId, 120),
        event_callback: function () { finish(true); },
        event_timeout: 1500,
      };
      if (params && typeof params.value === 'number') { data.value = params.value; data.currency = params.currency || 'BRL'; }
      window.gtag('event', 'conversion', data);
    });
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
    window.clarity('consentv2', {
      ad_Storage: consent.marketing ? 'granted' : 'denied',
      analytics_Storage: consent.analytics ? 'granted' : 'denied',
    });
  }

  function loadMetaPixel() {
    if (pixelLoaded) return;
    pixelLoaded = true;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    // A sessão first-party só é usada depois do consentimento de marketing.
    // O mesmo external_id segue no Pixel e na CAPI, melhorando a qualidade de
    // correspondência sem coletar telefone/e-mail antes de uma conversão.
    window.fbq('init', PIXEL_ID, { external_id: ensureSessionId() || undefined });
  }

  // Envia o evento para a Conversions API (server-side) com o mesmo event_id do Pixel.
  function capiSend(eventName, params, eventId, identity) {
    if (!consent.marketing) return;
    if (!META_EVENT_MAP[eventName]) return;
    var body = {
      event_name: eventName,
      event_id: eventId,
      event_source_url: safePageUrl(),
      event_time: Math.floor(Date.now() / 1000),
      consent_marketing: true,
      custom_data: params || {},
    };
    var fbp = getFbp();
    var fbc = getFbc();
    if (fbp) body.fbp = fbp;
    if (fbc) body.fbc = fbc;
    var normalizedEmail = identity ? normalizeEmailForAds(identity.email) : '';
    var normalizedPhone = identity ? normalizePhoneForAds(identity.phone) : '';
    if (normalizedEmail) body.email = normalizedEmail;
    if (normalizedPhone) body.phone = normalizedPhone;
    var externalId = identity && identity.external_id
      ? clean(identity.external_id, 120)
      : (ensureSessionId() || '');
    if (externalId) body.external_id = externalId;
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
    capiSend(eventName, params || {}, eventId, Object.assign({
      external_id: ensureSessionId() || undefined,
    }, identity || {}));
  }

  function marketingPageView() {
    if (!consent.marketing || marketingPageViewSent) return;
    marketingPageViewSent = true;
    var eventId = makeUuid();
    var payload = {
      event: 'apecerto_event',
      apecerto_event_name: 'page_view',
      apecerto_event_id: eventId,
      page_location: safePageUrl(),
      event_id: eventId,
    };
    window.dataLayer.push(payload);
    if (pixelLoaded && window.fbq) window.fbq('track', 'PageView', {}, { eventID: eventId });
    capiSend('page_view', {}, eventId, { external_id: ensureSessionId() || undefined });
  }

  function applyConsent(next) {
    var previousConsent = Object.assign({}, consent);
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
      if (clarityLoaded && window.clarity) {
        window.clarity('consentv2', {
          ad_Storage: consent.marketing ? 'granted' : 'denied',
          analytics_Storage: 'granted',
        });
      }
    } else if (clarityLoaded && window.clarity) {
      window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    }
    if (!consent.analytics && !consent.marketing) clearStoredTrackingIdentity();
    if (consent.marketing) {
      // O consentimento já foi atualizado no dataLayer. A partir daqui o GTM
      // pode iniciar sem competir com a primeira pintura e sem perder uma
      // conversão caso o visitante avance rapidamente para o WhatsApp.
      requestGtmNow();
      loadMetaPixel();
      if (window.fbq) window.fbq('consent', 'grant');
      loadGoogleAds();
      marketingPageView();
    } else if (previousConsent.marketing && pixelLoaded && window.fbq) {
      window.fbq('consent', 'revoke');
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
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'campaign_id', 'adset_id', 'ad_group_id', 'ad_id', 'creative_id', 'form_id', 'placement', 'tracking_ref'].forEach(function (key) {
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
      utm_source: clean(campaignTouch && campaignTouch.utm_source, 120) || null,
      utm_medium: clean(campaignTouch && campaignTouch.utm_medium, 120) || null,
      utm_campaign: clean(campaignTouch && campaignTouch.utm_campaign, 160) || null,
      properties: properties,
    };
    var trackUrl = SUPABASE_URL + '/functions/v1/site-track';
    var serializedBody = JSON.stringify(body);
    // O endpoint valida origem, evento e payload no servidor e não exige JWT.
    // text/plain mantém o beacon como requisição CORS simples, sem preflight;
    // request.json() continua interpretando o corpo normalmente na Edge.
    try {
      if (window.navigator && typeof window.navigator.sendBeacon === 'function' && typeof window.Blob === 'function') {
        var beaconBody = new window.Blob([serializedBody], { type: 'text/plain;charset=UTF-8' });
        if (window.navigator.sendBeacon(trackUrl, beaconBody)) return Promise.resolve(true);
      }
    } catch (beaconError) {}

    // Navegadores sem Beacon (ou com a fila cheia) usam fetch abortável. Não
    // usamos keepalive aqui: algumas implementações mantêm esse request vivo
    // mesmo depois do prazo, atrasando a condição de rede ociosa da página.
    var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    var timeoutId = controller ? window.setTimeout(function () { controller.abort(); }, 2500) : null;
    try {
      return fetch(trackUrl, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: serializedBody,
        signal: controller ? controller.signal : undefined,
      }).then(function (response) {
        return !!response.ok;
      }).catch(function () {
        return false;
      }).then(function (sent) {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        return sent;
      });
    } catch (error) {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      return Promise.resolve(false);
    }
  }

  window.apecertoTrack = function (eventName, params) {
    var sourceParams = params && typeof params === 'object' ? params : {};
    var identity = sourceParams.__identity && typeof sourceParams.__identity === 'object'
      ? sourceParams.__identity
      : null;
    var publicParams = privacySafeEventParams(sourceParams);
    var suppliedEventId = uuidOrNull(publicParams.event_id);
    delete publicParams.event_id;
    if (consent.marketing && /^(generate_lead|schedule_complete|whatsapp_click|phone_click)$/.test(eventName)) requestGtmNow();
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
    var eventId = suppliedEventId || makeUuid();
    var payload = Object.assign({ page_location: safePageUrl(), event_id: eventId }, publicParams);
    var attribution = readStoredAttribution();
    var campaignTouch = attribution.last && Object.keys(attribution.last).length
      ? attribution.last
      : currentTouch;
    if (campaignTouch) {
      ATTRIBUTION_EVENT_KEYS.forEach(function (key) {
        if (campaignTouch[key] && !payload[key]) payload[key] = campaignTouch[key];
      });
    }
    if (attribution.first && attribution.first.utm_campaign) payload.utm_campaign_first = attribution.first.utm_campaign;
    if (attribution.last && attribution.last.utm_campaign) payload.utm_campaign_last = attribution.last.utm_campaign;
    if (consent.analytics && ensureSessionId()) payload.apecerto_session_id = sessionId;
    if (consent.analytics && googleIdentity.client_id) payload.ga_client_id = googleIdentity.client_id;
    if (consent.analytics && googleIdentity.session_id) payload.ga_session_id = googleIdentity.session_id;
    if (consent.marketing && ((attribution.first && attribution.first.gclid) || currentTouch.gclid)) payload.has_gclid = true;
    var firstPartyPromise = firstPartyTrack(eventName, Object.assign({ event_id: eventId }, publicParams));
    // Disponibiliza os dados consentidos antes de o evento entrar no dataLayer,
    // para a tag de conversão do GTM conseguir aplicar conversões otimizadas.
    if (identity && consent.marketing) {
      var normalizedEmail = normalizeEmailForAds(identity.email);
      var normalizedPhone = normalizePhoneForAds(identity.phone);
      window.gtag('set', 'user_data', {
        email: normalizedEmail || undefined,
        phone_number: normalizedPhone || undefined,
      });
    }
    window.dataLayer.push(Object.assign({
      event: 'apecerto_event',
      apecerto_event_name: eventName,
      apecerto_event_id: eventId,
    }, payload));
    // Depois que o contêiner oficial assume os eventos, o navegador não envia
    // a mesma ocorrência duas vezes ao GA4. O page_view continua direto porque
    // a tag do GTM o exclui deliberadamente; se o GTM não carregar, o envio
    // direto permanece como fallback para todos os eventos.
    if (eventName === 'page_view' || !window.apecertoGtmGa4Managed) {
      window.gtag('event', eventName, payload);
    }
    var metaParams = Object.assign({}, publicParams);
    ATTRIBUTION_EVENT_KEYS.forEach(function (key) {
      if (campaignTouch && campaignTouch[key] && !metaParams[key]) metaParams[key] = campaignTouch[key];
    });
    metaTrack(eventName, metaParams, eventId, identity);
    // A conversão generate_lead é gerenciada no GTM quando o contêiner está
    // saudável. Sem GTM, mantém o beacon direto como contingência.
    var adsPromise = window.apecertoGtmAdsManaged
      ? Promise.resolve(false)
      : adsConversion(eventName, publicParams, eventId);
    if (clarityLoaded && window.clarity && /^(generate_lead|view_item|whatsapp_click|phone_click|sara_results|owner_portal_open)$/.test(eventName)) {
      window.clarity('event', eventName);
    }
    return Promise.all([
      Promise.resolve(firstPartyPromise).catch(function () { return false; }),
      Promise.resolve(adsPromise).catch(function () { return false; }),
    ]).then(function () { return true; }).catch(function () { return false; });
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

  function nextFinancingRequestId() {
    if (!uuidOrNull(financingRequestId)) financingRequestId = makeUuid();
    return financingRequestId;
  }

  window.apecertoResetFinancingLead = function () {
    financingRequestId = '';
  };

  function financingErrorType(status) {
    if (status === 400) return 'invalid_request';
    if (status === 403) return 'origin_not_allowed';
    if (status === 409) return 'idempotency_conflict';
    if (status === 429) return 'rate_limited';
    if (status === 503) return 'temporarily_unavailable';
    return status ? 'request_rejected' : 'network_error';
  }

  function trackFinancingError(errorType, source) {
    window.apecertoTrack('form_error', {
      form_context: 'financiamento',
      error_type: clean(errorType, 60) || 'request_rejected',
      item_id: clean(source && source.item_id, 100),
      item_name: clean(source && source.item_name, 160),
    });
  }

  // O financiamento usa uma Edge Function pública própria. request_id e o
  // cabeçalho de idempotência permanecem estáveis nos retries manuais da mesma
  // ficha; não há retry automático nem envio de chave/sessão do Supabase.
  window.apecertoSubmitFinancingLead = async function (input) {
    var source = input && typeof input === 'object' ? input : {};
    var tracking = window.apecertoLeadTracking ? window.apecertoLeadTracking() : {};
    var requestId = nextFinancingRequestId();
    var body = {
      request_id: requestId,
      event_id: requestId,
      nome: clean(source.nome, 120),
      telefone: clean(source.telefone, 40),
      email: clean(source.email, 254),
      renda_mensal: Number(source.renda_mensal),
      percentual_financiado: Number(source.percentual_financiado),
      empreendimento_id: uuidOrNull(source.empreendimento_id),
      unidade_id: uuidOrNull(source.unidade_id),
      page_view_id: uuidOrNull(tracking.page_view_id),
      tracking: tracking,
      page_url: safePageUrl(),
      item_id: clean(source.item_id, 100) || undefined,
      item_codigo: clean(source.item_codigo, 80) || undefined,
      item_name: clean(source.item_name, 160) || undefined,
    };
    var phoneDigits = body.telefone.replace(/\D/g, '');
    var validPhone = /^[1-9][0-9]{9,10}$/.test(phoneDigits)
      || /^55[1-9][0-9]{9,10}$/.test(phoneDigits);
    var validContact = body.nome.length >= 2
      && validPhone
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email);
    var validIncome = Number.isFinite(body.renda_mensal)
      && body.renda_mensal >= 500
      && body.renda_mensal <= 10000000;
    var validPercent = Number.isFinite(body.percentual_financiado)
      && Number.isInteger(body.percentual_financiado)
      && body.percentual_financiado >= 20
      && body.percentual_financiado <= 90
      && body.percentual_financiado % 5 === 0;
    if (!validContact || !validIncome || !validPercent || !body.empreendimento_id || !body.page_view_id) {
      trackFinancingError('invalid_request', source);
      var invalid = new Error('financing_invalid_request');
      invalid.status = 400;
      throw invalid;
    }
    var response;
    var result;
    var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    var timedOut = false;
    var timeoutId = controller ? window.setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, 15000) : null;
    try {
      response = await fetch(SUPABASE_URL + '/functions/v1/site-financing-lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': requestId,
        },
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
      });
      result = await response.json().catch(function () { return null; });
    } catch (networkError) {
      var transportError = timedOut || (networkError && networkError.name === 'AbortError')
        ? 'request_timeout'
        : 'network_error';
      trackFinancingError(transportError, source);
      var unavailable = new Error('financing_' + transportError);
      unavailable.status = transportError === 'request_timeout' ? 408 : 0;
      throw unavailable;
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
    if (!response.ok || response.status !== 202) {
      var rejectedType = financingErrorType(response.status);
      trackFinancingError(rejectedType, source);
      var rejected = new Error('financing_' + rejectedType);
      rejected.status = response.status;
      throw rejected;
    }
    if (!result || result.ok !== true || result.accepted !== true || uuidOrNull(result.request_id) !== requestId || !uuidOrNull(result.conversion_event_id)) {
      trackFinancingError('invalid_response', source);
      var invalidResponse = new Error('financing_invalid_response');
      invalidResponse.status = response.status;
      throw invalidResponse;
    }
    return {
      accepted: true,
      duplicate: result.duplicate === true,
      request_id: requestId,
      conversion_event_id: uuidOrNull(result.conversion_event_id),
    };
  };

  // Porta unica para todos os leads publicos. O navegador envia somente contato,
  // contexto comercial permitido e a atribuicao consentida — nunca documentos.
  window.apecertoSubmitSiteLead = async function (input) {
    var source = input && typeof input === 'object' ? input : {};
    if (source.lead_type === 'financiamento') {
      window.apecertoTrack('form_error', {
        form_context: 'financiamento',
        error_type: 'dedicated_endpoint_required',
      });
      var dedicatedEndpoint = new Error('financing_requires_dedicated_endpoint');
      dedicatedEndpoint.status = 400;
      throw dedicatedEndpoint;
    }
    var leadType = /^(comprador|proprietario)$/.test(source.lead_type)
      ? source.lead_type
      : 'comprador';
    var allowedContext = [
      'empreendimento_id', 'unidade_id', 'empreendimento_nome', 'preferencia_horario',
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
      empreendimento_id: uuidOrNull(source.empreendimento_id),
      unidade_id: uuidOrNull(source.unidade_id),
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
    document.documentElement.classList.add('apecerto-consent-open');
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
      document.documentElement.classList.remove('apecerto-consent-open');
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
          var attribution = readStoredAttribution();
          var touch = attribution.last && Object.keys(attribution.last).length ? attribution.last : currentTouch;
          var trackingRef = clean(touch && touch.tracking_ref, 100) || ('site-' + pageViewId.slice(0, 8));
          try {
            var whatsappUrl = new URL(link.href, location.href);
            var message = whatsappUrl.searchParams.get('text') || 'Olá! Vim pelo site da ApêCerto.';
            if (message.indexOf('Ref: ' + trackingRef) === -1) {
              whatsappUrl.searchParams.set('text', message.replace(/\s+$/, '') + '\nRef: ' + trackingRef);
              link.href = whatsappUrl.toString();
            }
          } catch (e) {}
          window.apecertoTrack('whatsapp_click', { source: 'link', action_label: cleanLabel(link.innerText), tracking_ref: trackingRef });
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

  // O site funciona como SPA. pushState e popstate representam navegação.
  // replaceState é usado internamente pelo catálogo dezenas de vezes para
  // sincronizar estado e nunca deve criar uma nova visualização.
  function trackSpaNavigation() {
    var lastPath = pagePath();
    var scheduled = false;
    function changed(source) {
      if (scheduled) return;
      scheduled = true;
      setTimeout(function () {
        scheduled = false;
        var nextPath = pagePath();
        if (nextPath === lastPath) return;
        lastPath = nextPath;
        pageViewId = makeUuid();
        window.apecertoTrack('page_view', {
          navigation_type: 'spa',
          navigation_source: source,
        });
      }, 0);
    }
    ['pushState'].forEach(function (method) {
      var original = window.history && window.history[method];
      if (typeof original !== 'function') return;
      window.history[method] = function () {
        var result = original.apply(this, arguments);
        changed(method);
        return result;
      };
    });
    window.addEventListener('popstate', function () { changed('popstate'); });
  }

  scheduleGoogleTagFallback();
  var storedConsent = restoreConsent();
  if (storedConsent) applyConsent(storedConsent);
  bindAutomaticEvents();
  trackScrollDepth();
  trackEngagement();
  trackSpaNavigation();
  firstPartyTrack('page_view', {});

  function trackingReady() {
    addConsentSettingsButton();
    if (!storedConsent) addConsentBanner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', trackingReady);
  else trackingReady();
})();
