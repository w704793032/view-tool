import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canReuseTreeNode,
  getDirectTreeNodes,
  toTreeEntryInfo,
} from '../public/tree-reconcile.mjs';

test('toTreeEntryInfo builds stable full paths for root entries', () => {
  assert.deepEqual(
    toTreeEntryInfo('.', { name: 'README.md', type: 'file', size: 42 }),
    { name: 'README.md', type: 'file', size: 42, fullPath: 'README.md' },
  );
});

test('toTreeEntryInfo builds stable full paths for nested entries', () => {
  assert.deepEqual(
    toTreeEntryInfo('src/lib', { name: 'tree.js', type: 'file' }),
    { name: 'tree.js', type: 'file', fullPath: 'src/lib/tree.js' },
  );
});

test('canReuseTreeNode keeps rows when path and type match', () => {
  assert.equal(
    canReuseTreeNode(
      { fullPath: 'src', type: 'dir' },
      { fullPath: 'src', type: 'dir', mtimeMs: 123 },
    ),
    true,
  );
});

test('canReuseTreeNode rejects rows when type changes', () => {
  assert.equal(
    canReuseTreeNode(
      { fullPath: 'src', type: 'dir' },
      { fullPath: 'src', type: 'file' },
    ),
    false,
  );
});

test('getDirectTreeNodes only returns direct tree-node children', () => {
  const directA = { classList: { contains: (name) => name === 'tree-node' } };
  const directOther = { classList: { contains: () => false } };
  const directB = { classList: { contains: (name) => name === 'tree-node' } };
  const nested = { classList: { contains: (name) => name === 'tree-node' } };
  const container = {
    children: [
      directA,
      directOther,
      {
        classList: { contains: () => false },
        children: [nested],
      },
      directB,
    ],
  };

  assert.deepEqual(getDirectTreeNodes(container), [directA, directB]);
});
