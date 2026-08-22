const ORIGIN = (process.env.APECERTO_LIVE_ORIGIN || 'https://apecerto.com').replace(/\/$/, '');
const IDS = {
  ga4: 'G-P63KVXKJDH',
  gtm: 'GTM-524TZP8X',
  ads: 'AW-18389793678',
  clarity: 'y3rdh7jjn5',
  meta: '1088080836200357',
};

const failures = [];
const checks = [];

async function request(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
        ...options,
      });
      checks.push(`${response.status} ${url}`);
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  failures.push(`rede indisponivel para ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  return null;
}

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) failures.push(message);
}

const homeResponse = await request(`${ORIGIN}/?tracking_live_smoke=1`, {
  headers: { 'cache-control': 'no-cache' },
});
let home = '';
if (homeResponse) {
  home = await homeResponse.text();
  if (!homeResponse.ok) failures.push(`home respondeu ${homeResponse.status}`);
  requireMatch(home, /googletagmanager\.com\/gtm\.js\?id=/, 'bootstrap do GTM ausente do head');
  requireMatch(home, new RegExp(IDS.gtm), 'ID canonico do GTM ausente do HTML');
  requireMatch(home, new RegExp(`ns\\.html\\?id=${IDS.gtm}`), 'GTM ausente do noscript');
  if ((home.match(/googletagmanager\.com\/gtm\.js\?id=/g) || []).length !== 1) failures.push('GTM deve carregar exatamente uma vez');

  const analyticsPath = home.match(/<script src="(\/assets\/analytics\.[a-f0-9]{12}\.js)" defer><\/script>/)?.[1];
  if (!analyticsPath) {
    failures.push('asset imutavel de tracking nao foi encontrado');
  } else {
    const analyticsResponse = await request(`${ORIGIN}${analyticsPath}`, { headers: { 'cache-control': 'no-cache' } });
    if (analyticsResponse) {
      const analytics = await analyticsResponse.text();
      if (!analyticsResponse.ok) failures.push(`runtime de tracking respondeu ${analyticsResponse.status}`);
      for (const [name, id] of Object.entries(IDS)) {
        if (name === 'gtm') continue;
        requireMatch(analytics, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${name} ${id} ausente do runtime`);
      }
      requireMatch(analytics, /\/functions\/v1\/site-track/, 'coleta first-party ausente');
      requireMatch(analytics, /\/functions\/v1\/meta-capi/, 'Meta CAPI do navegador ausente');
      requireMatch(analytics, /apecerto_event_id/, 'event_id de deduplicacao ausente');
      requireMatch(analytics, /gtag\('consent', 'update'/, 'Consent Mode update ausente');
      requireMatch(analytics, /data-consent="all"/, 'CMP sem aceite explicito de marketing');
    }
  }
}

const gtmResponse = await request(`https://www.googletagmanager.com/gtm.js?id=${IDS.gtm}`);
if (gtmResponse) {
  const gtm = await gtmResponse.text();
  if (!gtmResponse.ok) failures.push(`container GTM respondeu ${gtmResponse.status}`);
  requireMatch(gtm, new RegExp(IDS.gtm), 'container publico nao confirma o ID esperado');
  requireMatch(gtm, /apecerto_event_name/, 'container publico nao observa o contrato apecerto_event');
}

const gaResponse = await request(`https://www.googletagmanager.com/gtag/js?id=${IDS.ga4}`);
if (gaResponse) {
  if (!gaResponse.ok) failures.push(`Google tag GA4 respondeu ${gaResponse.status}`);
}

for (const endpoint of ['site-track', 'meta-capi']) {
  const response = await request(`https://diaegvfveqezispcthwk.supabase.co/functions/v1/${endpoint}`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,apikey,content-type',
    },
  });
  if (response) {
    if (!response.ok) failures.push(`${endpoint} preflight respondeu ${response.status}`);
    if (response.headers.get('access-control-allow-origin') !== ORIGIN) failures.push(`${endpoint} nao autorizou ${ORIGIN}`);
  }
}

if (failures.length) {
  console.error(`Tracking live smoke falhou (${failures.length}):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Tracking live smoke aprovado: ${checks.length} recursos verificados em ${ORIGIN}`);
}
