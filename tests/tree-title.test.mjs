import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTreeTitle,
  formatBytes,
  formatModifiedTime,
} from '../public/tree-title.mjs';

test('formatModifiedTime renders local timestamps with seconds', () => {
  const ms = new Date(2026, 5, 30, 14, 5, 9).getTime();
  assert.equal(formatModifiedTime(ms), '2026-06-30 14:05:09');
});

test('formatModifiedTime returns empty string for invalid values', () => {
  assert.equal(formatModifiedTime(undefined), '');
  assert.equal(formatModifiedTime(Number.NaN), '');
  assert.equal(formatModifiedTime('1782525912000'), '');
});

test('buildTreeTitle preserves the full name and adds modified time for folders', () => {
  const ms = new Date(2026, 5, 30, 14, 5, 9).getTime();
  assert.equal(
    buildTreeTitle('docs', { type: 'dir', mtimeMs: ms }),
    'docs\n修改时间：2026-06-30 14:05:09',
  );
});

test('buildTreeTitle adds file size when available', () => {
  const ms = new Date(2026, 5, 30, 14, 5, 9).getTime();
  assert.equal(
    buildTreeTitle('README.md', { type: 'file', size: 22358, mtimeMs: ms }),
    'README.md\n修改时间：2026-06-30 14:05:09\n大小：21.8 KB',
  );
});

test('buildTreeTitle falls back to the name when modified time is unavailable', () => {
  assert.equal(
    buildTreeTitle('README.md', { type: 'file', size: 22358 }),
    'README.md',
  );
});

test('formatBytes keeps existing tree size formatting', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.00 MB');
});
