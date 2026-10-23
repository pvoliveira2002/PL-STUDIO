import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runImageBatch } = require('../electron/image-batch.cjs');

test('lote continua após falha individual e produz relatório', async () => {
  const files = [{ name: 'um.jpg' }, { name: 'corrompida.jpg' }, { name: 'tres.jpg' }];
  const result = await runImageBatch({
    files,
    job: { cancelled: false },
    convert: async file => {
      if (file.name === 'corrompida.jpg') throw new Error('Arquivo inválido');
      return `${file.name}.webp`;
    },
  });
  assert.deepEqual(result.results, ['um.jpg.webp', 'tres.jpg.webp']);
  assert.deepEqual(result.failures, [{ name: 'corrompida.jpg', message: 'Arquivo inválido' }]);
  assert.equal(result.processed, 3);
  assert.equal(result.cancelled, false);
});

test('cancelamento interrompe o lote antes da próxima imagem', async () => {
  const job = { cancelled: false };
  const converted = [];
  const result = await runImageBatch({
    files: [{ name: 'um.jpg' }, { name: 'dois.jpg' }, { name: 'tres.jpg' }],
    job,
    convert: async file => { converted.push(file.name); return file.name; },
    notify: value => { if (value.completed === 1) job.cancelled = true; },
  });
  assert.deepEqual(converted, ['um.jpg']);
  assert.equal(result.cancelled, true);
  assert.equal(result.processed, 1);
});
