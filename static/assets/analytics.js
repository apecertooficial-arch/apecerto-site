(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-P63KVXKJDH';
  var CLARITY_ID = 'y3rdh7jjn5';
  var CONSENT_KEY = 'apecerto_consent_v1';
  var ATTRIBUTION_KEY = 'apecerto_attribution_v1';
  var googleLoaded = false;
  var clarityLoaded = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });

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
      allow_google_signals: true,
      allow_ad_personalization_signals: true,
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

  function applyConsent(choice) {
    var granted = choice === 'accepted';
    window.gtag('consent', 'update', {
      ad_storage: granted ? 'granted' : 'denied',
      analytics_storage: granted ? 'granted' : 'denied',
      ad_user_data: granted ? 'granted' : 'denied',
      ad_personalization: granted ? 'granted' : 'denied',
    });
    if (granted) {
      loadGoogleTag();
      loadClarity();
    } else if (clarityLoaded && window.clarity) {
      window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    }
  }

  function saveAttribution() {
    var query = new URLSearchParams(location.search);
    var keys = ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    var data = { landing_page: location.href, captured_at: new Date().toISOString() };
    var found = false;
    keys.forEach(function (key) {
      if (query.get(key)) {
        data[key] = query.get(key);
        found = true;
      }
    });
    if (found) {
      try { localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(data)); } catch (e) {}
    }
  }

  window.apecertoTrack = function (eventName, params) {
    var payload = Object.assign({ page_location: location.href }, params || {});
    try {
      var attribution = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || '{}');
      if (attribution.utm_campaign) payload.utm_campaign_first = attribution.utm_campaign;
      if (attribution.gclid) payload.has_gclid = true;
    } catch (e) {}
    window.gtag('event', eventName, payload);
    if (clarityLoaded && window.clarity && /^(generate_lead|view_item|whatsapp_click|phone_click|sara_results|owner_portal_open)$/.test(eventName)) {
      window.clarity('event', eventName);
    }
  };

  function addConsentBanner() {
    var banner = document.createElement('section');
    banner.id = 'apecerto-consent';
    banner.setAttribute('aria-label', 'Preferências de privacidade');
    banner.innerHTML = '<div><strong>Sua privacidade importa.</strong><p>Com sua autorização, usamos medição, mapas de calor e gravações de interação para melhorar o site e os anúncios. Campos digitados e áreas sensíveis são mascarados.</p><a href="/privacidade/">Política de privacidade</a></div><div class="apecerto-consent-actions"><button type="button" data-consent="rejected">Somente essenciais</button><button type="button" data-consent="accepted" class="primary">Aceitar medição</button></div>';
    banner.addEventListener('click', function (event) {
      var button = event.target.closest('[data-consent]');
      if (!button) return;
      var choice = button.getAttribute('data-consent');
      try { localStorage.setItem(CONSENT_KEY, choice); } catch (e) {}
      applyConsent(choice);
      banner.remove();
      window.apecertoTrack('consent_update', { consent_choice: choice });
    });
    document.body.appendChild(banner);
  }

  window.apecertoOpenConsent = function () {
    var existing = document.getElementById('apecerto-consent');
    if (existing) existing.remove();
    addConsentBanner();
  };

  function cleanLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
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
          window.apecertoTrack('whatsapp_click', { link_text: cleanLabel(link.innerText), link_url: href });
        } else if (/^tel:/i.test(href)) {
          window.apecertoTrack('phone_click', { link_url: href });
        } else if (/instagram\.com/i.test(href)) {
          window.apecertoTrack('social_click', { social_network: 'instagram', link_url: href });
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

  saveAttribution();
  bindAutomaticEvents();
  trackScrollDepth();
  var stored = null;
  try { stored = localStorage.getItem(CONSENT_KEY); } catch (e) {}
  if (stored === 'accepted' || stored === 'rejected') applyConsent(stored);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { if (!stored) addConsentBanner(); });
  } else if (!stored) {
    addConsentBanner();
  }
})();
