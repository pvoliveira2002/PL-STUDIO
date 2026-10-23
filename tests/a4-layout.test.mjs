import test from 'node:test';
import assert from 'node:assert/strict';
import { A4_PAGE_MM, containInBox, createA4ImageGrid, getA4GridSlot } from '../src/features/images/a4Layout.js';

test('grade de duas colunas ocupa uma página A4 dentro das margens', () => {
  const layout = createA4ImageGrid(2);
  assert.deepEqual(A4_PAGE_MM, { width: 210, height: 297 });
  assert.equal(layout.perPage, 6);
  const last = getA4GridSlot(layout, 5);
  assert.ok(Math.abs(last.x + last.width - 200) < 1e-9);
  assert.ok(Math.abs(last.y + last.height - 287) < 1e-9);
});

test('encaixe preserva proporção e centraliza a imagem na célula', () => {
  const box = { x: 10, y: 20, width: 90, height: 80 };
  const placed = containInBox(1200, 600, box);
  assert.equal(placed.width, 90);
  assert.equal(placed.height, 45);
  assert.equal(placed.x, 10);
  assert.equal(placed.y, 37.5);
});
