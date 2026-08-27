import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hashedBrazilPhone,
  hashedEmail,
  normalizeBrazilPhone,
  normalizeEmail,
  safeEventSourceUrl,
  sanitizeMetaCustomData,
} from '../supabase/functions/_shared/meta-identity.ts';

test('normaliza identidade Meta e rejeita valores inválidos antes do hash', async () => {
  assert.equal(normalizeEmail('  CLIENTE@Exemplo.COM '), 'cliente@exemplo.com');
  assert.equal(normalizeEmail('email-invalido'), '');
  assert.equal(normalizeBrazilPhone('(11) 98015-4312'), '5511980154312');
  assert.equal(normalizeBrazilPhone('+55 11 98015-4312'), '5511980154312');
  assert.equal(normalizeBrazilPhone('123'), '');
  assert.match(await hashedEmail('CLIENTE@EXEMPLO.COM'), /^[a-f0-9]{64}$/);
  assert.match(await hashedBrazilPhone('(11) 98015-4312'), /^[a-f0-9]{64}$/);
  assert.equal(await hashedEmail('inválido'), '');
  assert.equal(await hashedBrazilPhone('123'), '');
});

test('URL enviada à Meta não carrega PII, tokens nem fragmento', () => {
  const result = safeEventSourceUrl('https://apecerto.com/imovel/123?utm_source=meta&EMAIL=pessoa%40exemplo.com&telefone=11999999999&token=segredo#dados');
  assert.equal(result, 'https://apecerto.com/imovel/123?utm_source=meta');
  assert.equal(safeEventSourceUrl('https://exemplo.com/imovel?utm_source=meta'), 'https://apecerto.com/');
  assert.equal(safeEventSourceUrl('http://apecerto.com/imovel?utm_source=meta'), 'https://apecerto.com/');
});

test('custom_data remove apenas chaves de PII e preserva dimensões comerciais', () => {
  assert.deepEqual(sanitizeMetaCustomData({
    email: 'pessoa@exemplo.com',
    phone_number: '11999999999',
    full_name: 'Pessoa Teste',
    item_name: 'Apartamento Moema',
    item_id: 'MO-123',
    value: 2100000,
  }), {
    item_name: 'Apartamento Moema',
    item_id: 'MO-123',
    value: 2100000,
  });
});
