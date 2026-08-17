(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-P63KVXKJDH';
  var CLARITY_ID = 'y3rdh7jjn5';
  var SUPABASE_URL = 'https://diaegvfveqezispcthwk.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpYWVndmZ2ZXFlemlzcGN0aHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5OTU4MjIsImV4cCI6MjA5ODU3MTgyMn0.312n8BuI-loQrQ20x9j1hNjKZs2UO71ey9gvIo0eY0I';
  var CONSENT_KEY = 'apecerto_consent_v2';
  var LEGACY_CONSENT_KEY = 'apecerto_consent_v1';
  var ATTRIBUTION_KEY = 'apecerto_attribution_v2';
  var pageViewId = makeUuid();
  var googleLoaded = false;
  var clarityLoaded = false;
  var consent = { analytics: false, marketing: false };
  var currentTouch = readCurrentTouch();

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
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 120);
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

  function readCurrentTouch() {
    var query = new URLSearchParams(location.search);
    var keys = ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
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
    var data = Object.assign({}, currentTouch);
    if (!consent.marketing) {
      delete data.gclid;
      delete data.gbraid;
      delete data.wbraid;
    }
    return data;
  }

  function persistAttribution() {
    if (!consent.analytics && !consent.marketing) return;
    try {
      var stored = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || '{}');
      var touch = attributionForStorage();
      localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ first: stored.first || touch, last: touch }));
    } catch (e) {}
  }

  function readStoredAttribution() {
    if (!consent.analytics && !consent.marketing) return {};
    try { return JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || '{}'); } catch (e) { return {}; }
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
      persistAttribution();
      loadClarity();
    } else if (clarityLoaded && window.clarity) {
      window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
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
    var body = {
      page_view_id: pageViewId,
      event_name: clean(eventName, 60),
      page_path: pagePath(),
      referrer_host: referrerHost() || null,
      device_category: deviceCategory(),
      consent_level: consentLevel(),
      utm_source: clean(currentTouch.utm_source, 120) || null,
      utm_medium: clean(currentTouch.utm_medium, 120) || null,
      utm_campaign: clean(currentTouch.utm_campaign, 160) || null,
      properties: params || {},
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
    var payload = Object.assign({ page_location: location.href }, params || {});
    var attribution = readStoredAttribution();
    if (attribution.first && attribution.first.utm_campaign) payload.utm_campaign_first = attribution.first.utm_campaign;
    if (consent.marketing && ((attribution.first && attribution.first.gclid) || currentTouch.gclid)) payload.has_gclid = true;
    firstPartyTrack(eventName, params || {});
    window.gtag('event', eventName, payload);
    if (clarityLoaded && window.clarity && /^(generate_lead|view_item|whatsapp_click|phone_click|sara_results|owner_portal_open)$/.test(eventName)) {
      window.clarity('event', eventName);
    }
  };

  window.apecertoLeadTracking = function () {
    var stored = readStoredAttribution();
    var current = Object.assign({}, currentTouch);
    if (!consent.marketing) {
      delete current.gclid;
      delete current.gbraid;
      delete current.wbraid;
    }
    return {
      version: 1,
      page_view_id: pageViewId,
      landing_path: pagePath(),
      referrer_host: referrerHost() || null,
      consent: { analytics: consent.analytics, marketing: consent.marketing },
      attribution: { first: stored.first || current, current: current },
    };
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

  function cleanLabel(value) {
    return clean(value, 80);
  }

  function trackScrollDepth() {
    var sent = {};
    var points = [25, 50, 75, 90];
    function measure() {
      var doc = document.documentElement;
      var height = Math.max(doc.scrollHeight - window.innerHeight, 1);
      var percent = Math.round((window.scrollY / height) * 100);
      points.forEach(function (point) {
        if (percent >= point && !sent[point]) {
          sent[point] = true;
          window.apecertoTrack('scroll_depth', { percent_scrolled: point });
        }
      });
    }
    window.addEventListener('scroll', measure, { passive: true });
  }

  function formContext(field) {
    var name = cleanLabel(field.getAttribute('name')).toLowerCase();
    var placeholder = cleanLabel(field.getAttribute('placeholder')).toLowerCase();
    if (/o que você procura|o que voce procura/.test(placeholder)) return 'sara';
    if (/cpf|rg|renda|nascimento/.test(name + ' ' + placeholder)) return 'financiamento';
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
      } else if (/favorit/i.test(label)) {
        window.apecertoTrack('favorite_toggle', { action_label: label });
      } else if (/foto anterior|próxima foto|proxima foto/i.test(label)) {
        window.apecertoTrack('gallery_interaction', { action_label: label });
      } else if (/buscar apê|buscar ape/i.test(label)) {
        window.apecertoTrack('property_search', { source: 'hero' });
      } else if (/agendar visita/i.test(label)) {
        window.apecertoTrack('cta_click', { cta_name: 'agendar_visita' });
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
    }, true);
  }

  loadGoogleTag();
  var storedConsent = restoreConsent();
  if (storedConsent) applyConsent(storedConsent);
  bindAutomaticEvents();
  trackScrollDepth();
  firstPartyTrack('page_view', {});

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { if (!storedConsent) addConsentBanner(); });
  } else if (!storedConsent) {
    addConsentBanner();
  }
})();
