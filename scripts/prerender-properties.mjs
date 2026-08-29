import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  catalogEntities,
  fetchCatalog,
  injectPropertyMetadata,
  metadataFor,
} from '../supabase/functions/site-seo/index.ts';
import { safeDistPath } from './site-build-lib.mjs';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,178}[a-z0-9])?$/;
const MOA_GIF_PATH = '/storage/v1/object/public/empreendimentos/moa/4lq4pd7p32p.gif';
const MOA_POSTER_URL = 'https://apecerto.com/assets/media/fac779ec499e72abf87e.jpg';

const applyLocalMediaOverrides = (metadata, entity) => {
  const replace = value => String(value || '').split(/[?#]/)[0].endsWith(MOA_GIF_PATH) ? MOA_POSTER_URL : value;
  const images = (metadata.images || []).map(replace);
  const source = { ...(entity?.row || {}), ...(entity?.unit || {}) };
  const tipologia = String(source.tipologia || '').toLowerCase();
  const tipo = /studio/.test(tipologia) ? 'Studio' : /cobertura/.test(tipologia) ? 'Cobertura' : /casa/.test(tipologia) ? 'Casa' : 'Apartamento';
  const dormitorios = Number(source.dormitorios);
  const quartos = Number.isFinite(dormitorios) && dormitorios > 0 ? ` com ${dormitorios} ${dormitorios === 1 ? 'quarto' : 'quartos'}` : '';
  const bairro = String(source.bairro || '').replace(/\s+/g, ' ').trim();
  const cidade = String(source.cidade || 'São Paulo').replace(/\s+/g, ' ').trim();
  const name = `${tipo}${quartos}${bairro ? ` em ${bairro}` : ''}`.slice(0, 120);
  const area = Number(source.area_util || source.area_min_disponivel);
  const description = [name, Number.isFinite(area) && area > 0 ? `${area.toLocaleString('pt-BR')} m²` : '', bairro, cidade].filter(Boolean).join(' · ').slice(0, 240);
  const publicAddress = {
    '@type': 'PostalAddress',
    addressLocality: cidade,
    addressRegion: String(source.uf || 'SP').slice(0, 2),
    addressCountry: 'BR',
  };
  return {
    ...metadata,
    name,
    title: `${name} | apêcerto`,
    description,
    images,
    jsonLd: { ...metadata.jsonLd, name, description, image: images, address: publicAddress, geo: undefined },
  };
};

const publicCatalogConfig = design => {
  const url = design.match(/\bSB_URL\s*=\s*'([^']+)'/)?.[1] || '';
  const key = design.match(/\bSB_KEY\s*=\s*'([^']+)'/)?.[1] || '';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) throw new Error('catalog_public_url_missing');
  if (!key || key.startsWith('sb_secret_')) throw new Error('catalog_public_key_missing');
  return { url, key };
};

const validMetadata = (entity, metadata, origin) => {
  if (!SLUG_PATTERN.test(entity.slug)) return false;
  if (!metadata?.name || metadata.name === 'Imóvel ApeCerto') return false;
  if (!metadata?.title || !metadata?.description) return false;
  if (metadata.canonical !== `${origin}/imovel/${encodeURIComponent(entity.slug)}/`) return false;
  if (!metadata.jsonLd || metadata.jsonLd['@type'] !== 'Apartment') return false;
  if (metadata.jsonLd.address?.streetAddress || metadata.jsonLd.geo) return false;
  return true;
};

const catalogHash = entities => createHash('sha256')
  .update(JSON.stringify(entities.map(entity => ({
    kind: entity.kind,
    slug: entity.slug,
    id: String(entity.unit?.id || entity.row?.id || ''),
  })).sort((a, b) => a.slug.localeCompare(b.slug))))
  .digest('hex');

const noindex404 = shell => {
  const metadata = {
    title: 'Imóvel não encontrado | apêcerto',
    description: 'Este imóvel não está disponível no catálogo público da apêcerto.',
    canonical: 'https://apecerto.com/imovel/nao-encontrado/',
    images: [],
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Imóvel não encontrado' },
  };
  return injectPropertyMetadata(shell, metadata, { noindex: true });
};

export async function prerenderProperties({ root, distDir, config, fetchImpl = fetch }) {
  const design = await readFile(`${root}/${config.designSource}`, 'utf8');
  const { url, key } = publicCatalogConfig(design);
  const env = { get: name => name === 'SUPABASE_URL' ? url : name === 'SUPABASE_ANON_KEY' ? key : '' };
  const { rows, supabaseUrl } = await fetchCatalog({ fetchImpl, env });
  if (!rows.length) throw new Error('catalog_public_empty');

  const entities = catalogEntities(rows).sort((a, b) => a.slug.localeCompare(b.slug));
  const seen = new Set();
  for (const entity of entities) {
    if (seen.has(entity.slug)) throw new Error(`catalog_slug_ambiguous:${entity.slug}`);
    seen.add(entity.slug);
  }
  if (!entities.length) throw new Error('catalog_entities_empty');

  const shell = await readFile(safeDistPath(distDir, 'index.html'), 'utf8');
  const urls = [];
  for (const entity of entities) {
    const metadata = applyLocalMediaOverrides(metadataFor(entity, supabaseUrl), entity);
    if (!validMetadata(entity, metadata, config.origin)) throw new Error(`catalog_entity_invalid:${entity.slug}`);
    const output = safeDistPath(distDir, `imovel/${entity.slug}/index.html`);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, injectPropertyMetadata(shell, metadata));
    urls.push(metadata.canonical);
  }

  await writeFile(safeDistPath(distDir, '404.html'), noindex404(shell));
  return {
    generatedAt: new Date().toISOString(),
    hash: catalogHash(entities),
    rows: rows.length,
    pages: entities.length,
    urls,
  };
}
