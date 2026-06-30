import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TREE_REFRESH_INTERVAL_MS,
  getTreeRefreshPaths,
} from '../public/tree-refresh.mjs';

test('tree auto refresh interval is 5 seconds', () => {
  assert.equal(TREE_REFRESH_INTERVAL_MS, 5000);
});

test('getTreeRefreshPaths always refreshes root first', () => {
  assert.deepEqual(getTreeRefreshPaths(new Set()), ['.']);
});

test('getTreeRefreshPaths includes expanded directories without duplicating root', () => {
  assert.deepEqual(
    getTreeRefreshPaths(new Set(['.', 'src', 'src/lib'])),
    ['.', 'src', 'src/lib'],
  );
});

test('getTreeRefreshPaths ignores invalid path values', () => {
  assert.deepEqual(
    getTreeRefreshPaths(['.', '', null, 'src', undefined, 'src']),
    ['.', 'src'],
  );
});
