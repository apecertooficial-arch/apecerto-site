(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-P63KVXKJDH';
  var CONSENT_KEY = 'apecerto_consent_v1';
  var ATTRIBUTION_KEY = 'apecerto_attribution_v1';
  var loaded = false;

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
    if (loaded) return;
    loaded = true;
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

  function applyConsent(choice) {
    var granted = choice === 'accepted';
    window.gtag('consent', 'update', {
      ad_storage: granted ? 'granted' : 'denied',
      analytics_storage: granted ? 'granted' : 'denied',
      ad_user_data: granted ? 'granted' : 'denied',
      ad_personalization: granted ? 'granted' : 'denied',
    });
    if (granted) loadGoogleTag();
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
  };

  function addConsentBanner() {
    var banner = document.createElement('section');
    banner.id = 'apecerto-consent';
    banner.setAttribute('aria-label', 'Preferências de privacidade');
    banner.innerHTML = '<div><strong>Sua privacidade importa.</strong><p>Usamos cookies de medição para entender o site e melhorar nossos anúncios. Você pode aceitar ou continuar somente com os cookies essenciais.</p><a href="/privacidade/">Política de privacidade</a></div><div class="apecerto-consent-actions"><button type="button" data-consent="rejected">Somente essenciais</button><button type="button" data-consent="accepted" class="primary">Aceitar medição</button></div>';
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

  function bindAutomaticEvents() {
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href]');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      if (/wa\.me|api\.whatsapp\.com/i.test(href)) {
        window.apecertoTrack('whatsapp_click', { link_text: (link.innerText || '').trim(), link_url: href });
      } else if (/^tel:/i.test(href)) {
        window.apecertoTrack('phone_click', { link_url: href });
      } else if (/instagram\.com/i.test(href)) {
        window.apecertoTrack('social_click', { social_network: 'instagram', link_url: href });
      }
    }, true);
  }

  saveAttribution();
  bindAutomaticEvents();
  var stored = null;
  try { stored = localStorage.getItem(CONSENT_KEY); } catch (e) {}
  if (stored === 'accepted' || stored === 'rejected') applyConsent(stored);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { if (!stored) addConsentBanner(); });
  } else if (!stored) {
    addConsentBanner();
  }
})();
