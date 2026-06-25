'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  normalizeRootList,
  normalizeRootConfig,
  addRecentRoot,
  pinRoot,
  unpinRoot,
  removeRoot,
} = require('../lib/root-history');

test('normalizeRootList keeps strings, resolves paths, removes duplicates, and honors limit', () => {
  const a = path.resolve('a');
  const b = path.resolve('b');

  assert.deepStrictEqual(
    normalizeRootList(['a', 'b', 'a', '', null, 42], { limit: 2 }),
    [a, b],
  );
});

test('normalizeRootConfig gives missing or invalid lists empty arrays', () => {
  assert.deepStrictEqual(
    normalizeRootConfig({ rootDir: 'x', recentRoots: 'bad', pinnedRoots: null }),
    { rootDir: 'x', recentRoots: [], pinnedRoots: [] },
  );
});

test('addRecentRoot moves root to the front and caps recentRoots to 10 entries', () => {
  const roots = Array.from({ length: 11 }, (_, i) => path.resolve(`root-${i}`));
  const cfg = addRecentRoot({ recentRoots: roots }, roots[5]);

  assert.strictEqual(cfg.recentRoots[0], roots[5]);
  assert.strictEqual(cfg.recentRoots.length, 10);
  assert.strictEqual(new Set(cfg.recentRoots).size, cfg.recentRoots.length);
});

test('pinRoot appends a normalized root once while keeping order', () => {
  const a = path.resolve('a');
  const b = path.resolve('b');
  const cfg = pinRoot({ pinnedRoots: [a] }, b);
  const again = pinRoot(cfg, b);

  assert.deepStrictEqual(again.pinnedRoots, [a, b]);
});

test('unpinRoot removes only from pinnedRoots', () => {
  const a = path.resolve('a');
  const cfg = unpinRoot({ recentRoots: [a], pinnedRoots: [a] }, a);

  assert.deepStrictEqual(cfg.recentRoots, [a]);
  assert.deepStrictEqual(cfg.pinnedRoots, []);
});

test('removeRoot removes from both recentRoots and pinnedRoots', () => {
  const a = path.resolve('a');
  const b = path.resolve('b');
  const cfg = removeRoot({ recentRoots: [a, b], pinnedRoots: [a] }, a);

  assert.deepStrictEqual(cfg.recentRoots, [b]);
  assert.deepStrictEqual(cfg.pinnedRoots, []);
});
