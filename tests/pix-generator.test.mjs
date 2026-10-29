import test from 'node:test';
import assert from 'node:assert/strict';
import { crc16, detectPixKeyType, generatePixPayload, normalizePixKey, validatePixKey } from '../src/features/pix/pixPayload.js';
import { calculatePixA4Layout } from '../src/features/pix/pixLayout.js';

const base = { name: 'JOAO DA SILVA', city: 'SAO PAULO', keyType: 'email', key: 'pix@example.com', amount: '', description: '', txid: '' };

test('normaliza e identifica os tipos de chave Pix usados na loja', () => {
  assert.equal(normalizePixKey('phone', '(21) 99999-9999'), '+5521999999999');
  assert.equal(detectPixKeyType('529.982.247-25'), 'cpf');
  assert.equal(detectPixKeyType('pix+loja@example.com'), 'email');
  assert.equal(validatePixKey('cnpj', '04.252.011/0001-10'), true);
});

test('gera BR Code com CRC válido, valor e TXID', () => {
  const payload = generatePixPayload({ ...base, amount: '25,50', txid: 'PEDIDO123' });
  assert.match(payload, /^00020126/);
  assert.ok(payload.includes('540525.50'));
  assert.ok(payload.includes('0509PEDIDO123'));
  assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)));
});

test('calcula distribuição física conservando medidas na folha A4', () => {
  const layout = calculatePixA4Layout(100, 150, 5, 5, 2);
  assert.equal(layout.capacity, 2);
  assert.equal(layout.count, 2);
  assert.equal(layout.rotated, true);
  assert.deepEqual([layout.positions[0].width, layout.positions[0].height], [150, 100]);
});
