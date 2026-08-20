import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const container = JSON.parse(readFileSync(new URL('../docs/gtm-apecerto-tracking-360.json', import.meta.url), 'utf8'));
const version = container.containerVersion;

test('container GTM espelha o contrato 360 sem duplicar plataformas', () => {
  assert.equal(version.container.publicId, 'GTM-524TZP8X');
  assert.equal(version.tag.length, 2);
  assert.equal(version.trigger.length, 10);
  assert.equal(version.variable.length, 15);

  const html = version.tag
    .flatMap((tag) => tag.parameter || [])
    .filter((parameter) => parameter.key === 'html')
    .map((parameter) => parameter.value)
    .join('\n');

  assert.doesNotMatch(html, /fbq\s*\(/i, 'o GTM não pode duplicar o Pixel');
  assert.doesNotMatch(html, /gtag\s*\(\s*['"]event/i, 'o GTM não pode duplicar GA4 ou Google Ads');
  assert.doesNotMatch(html, /clarity\s*\(\s*['"]event/i, 'o GTM não pode duplicar Clarity');
  assert.doesNotMatch(html, /functions\/v1\/meta-capi/i, 'o GTM não pode duplicar a CAPI');
});

test('container GTM expõe os principais eventos de negócio', () => {
  const triggerNames = new Set(version.trigger.map((trigger) => trigger.name));
  [
    'CE — Todos os eventos ApêCerto',
    'CE — Lead enviado',
    'CE — Clique no WhatsApp',
    'CE — Imóvel visualizado',
    'CE — Intenção de proprietário',
    'CE — Agendamento iniciado',
    'CE — Visita agendada no site',
    'CE — Formulário iniciado',
    'CE — Erro de formulário',
    'CE — Profundidade de rolagem',
  ].forEach((name) => assert.ok(triggerNames.has(name), `acionador ausente: ${name}`));

  const variableNames = new Set(version.variable.map((variable) => variable.name));
  [
    'DLV — Nome do evento',
    'DLV — ID do evento',
    'DLV — ID do imóvel',
    'DLV — Sessão ApêCerto',
    'DLV — GA Client ID',
    'DLV — GA Session ID',
    'DLV — UTM Campaign Last',
  ].forEach((name) => assert.ok(variableNames.has(name), `variável ausente: ${name}`));
});

test('validador do contrato usa o evento universal e preserva o event_id', () => {
  const validator = version.tag.find((tag) => tag.name === 'ApêCerto — Validador do contrato 360');
  assert.ok(validator);
  assert.deepEqual(validator.firingTriggerId, ['201']);

  const validatorHtml = validator.parameter.find((parameter) => parameter.key === 'html')?.value || '';
  assert.match(validatorHtml, /\{\{DLV — Nome do evento\}\}/);
  assert.match(validatorHtml, /\{\{DLV — ID do evento\}\}/);
  assert.match(validatorHtml, /window\.apecertoGtm360/);
});
