'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

test('app.js imports tree auto refresh helpers', () => {
  assert.match(APP_JS, /from\s+['"]\.\/tree-refresh\.mjs['"]/);
  assert.match(APP_JS, /TREE_REFRESH_INTERVAL_MS/);
  assert.match(APP_JS, /getTreeRefreshPaths/);
});

test('app.js imports tree reconciliation helpers', () => {
  assert.match(APP_JS, /from\s+['"]\.\/tree-reconcile\.mjs['"]/);
  assert.match(APP_JS, /canReuseTreeNode/);
  assert.match(APP_JS, /getDirectTreeNodes/);
  assert.match(APP_JS, /toTreeEntryInfo/);
});

test('app.js defines tree auto refresh setup and refresh functions', () => {
  assert.match(APP_JS, /function\s+setupTreeAutoRefresh\s*\(/);
  assert.match(APP_JS, /async\s+function\s+refreshTree\s*\(/);
  assert.match(APP_JS, /function\s+refreshVisibleChildren\s*\(/);
});

test('silent tree refresh enables reconciliation instead of full replacement', () => {
  assert.match(APP_JS, /reconcile:\s*true/);
  assert.match(APP_JS, /function\s+reconcileEntries\s*\(/);
  assert.match(APP_JS, /function\s+updateTreeNode\s*\(/);
});

test('reconciliation handles entries that do not already have DOM nodes', () => {
  assert.match(APP_JS, /existingNode\s+\?\s+treeInfoForNode\(existingNode\)\s+:\s+null/);
});

test('tree auto refresh uses a 5 second interval constant', () => {
  assert.match(APP_JS, /setInterval\(\s*\(\)\s*=>\s*refreshTree\(\)\s*,\s*TREE_REFRESH_INTERVAL_MS\s*\)/);
});

test('main starts tree auto refresh after initial render', () => {
  assert.match(APP_JS, /await\s+renderTree\(\)/);
  assert.match(APP_JS, /setupTreeAutoRefresh\(\)/);
});
