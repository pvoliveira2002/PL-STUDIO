import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A6_LANDSCAPE_MM,
  createPhotoSheetLayout,
  mmToPixels,
} from '../src/features/images/photoSheetLayout.js';

test('A6 paisagem em 300 DPI possui 1748 por 1240 pixels', () => {
  assert.deepEqual(A6_LANDSCAPE_MM, { width: 148, height: 105 });
  assert.equal(mmToPixels(A6_LANDSCAPE_MM.width), 1748);
  assert.equal(mmToPixels(A6_LANDSCAPE_MM.height), 1240);
});

test('folha A6 comporta oito fotos de alicate 3,2 x 4 cm sem alterar suas medidas', () => {
  const layout = createPhotoSheetLayout({
    page: 'a6',
    photoWidth: 32,
    photoHeight: 40,
    copies: 8,
  });
  assert.equal(layout.columns, 4);
  assert.equal(layout.rows, 2);
  assert.equal(layout.capacity, 8);
  assert.equal(layout.positions.length, 8);
  for (const position of layout.positions) {
    assert.equal(position.width, 32);
    assert.equal(position.height, 40);
    assert.ok(position.x >= 0 && position.x + position.width <= 148);
    assert.ok(position.y >= 0 && position.y + position.height <= 105);
  }
});

test('medida maior que a folha A6 é rejeitada sem redimensionamento oculto', () => {
  const layout = createPhotoSheetLayout({
    page: 'a6',
    photoWidth: 80,
    photoHeight: 120,
    copies: 1,
  });
  assert.equal(layout.capacity, 0);
  assert.deepEqual(layout.positions, []);
});
