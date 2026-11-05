import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampSheetRange,
  XLSX_PREVIEW_MAX_ROWS,
  XLSX_PREVIEW_MAX_COLS,
} from '../public/office-preview.mjs';

test('clampSheetRange truncates oversized sheets', () => {
  const { range, truncated } = clampSheetRange({
    s: { r: 0, c: 0 },
    e: { r: 9999, c: 200 },
  });
  assert.strictEqual(truncated, true);
  assert.deepEqual(range.s, { r: 0, c: 0 });
  assert.deepEqual(range.e, {
    r: XLSX_PREVIEW_MAX_ROWS - 1,
    c: XLSX_PREVIEW_MAX_COLS - 1,
  });
});

test('clampSheetRange keeps small sheets untouched', () => {
  const original = { s: { r: 0, c: 0 }, e: { r: 9, c: 4 } };
  const { range, truncated } = clampSheetRange(original);
  assert.strictEqual(truncated, false);
  assert.deepEqual(range, original);
});

test('clampSheetRange respects a non-zero start cell', () => {
  const { range } = clampSheetRange({ s: { r: 100, c: 10 }, e: { r: 10000, c: 100 } });
  assert.deepEqual(range.s, { r: 100, c: 10 });
  assert.deepEqual(range.e, {
    r: 100 + XLSX_PREVIEW_MAX_ROWS - 1,
    c: 10 + XLSX_PREVIEW_MAX_COLS - 1,
  });
});

test('clampSheetRange handles custom limits', () => {
  const { range, truncated } = clampSheetRange(
    { s: { r: 0, c: 0 }, e: { r: 20, c: 20 } },
    10,
    5,
  );
  assert.strictEqual(truncated, true);
  assert.deepEqual(range.e, { r: 9, c: 4 });
});
