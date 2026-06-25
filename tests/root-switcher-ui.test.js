'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('toolbar contains root switch button and menu container', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

  assert.match(html, /id="switchRootBtn"/);
  assert.match(html, /id="rootMenu"/);
});

test('root switcher css defines menu and item states', () => {
  const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');

  assert.match(css, /\.root-switch/);
  assert.match(css, /\.root-menu/);
  assert.match(css, /\.root-menu-item/);
  assert.match(css, /\.root-menu-action/);
});

test('app.js stores root lists and calls root management APIs', () => {
  const js = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

  assert.match(js, /recentRoots/);
  assert.match(js, /pinnedRoots/);
  assert.match(js, /renderRootMenu/);
  assert.match(js, /\/api\/roots\/pin/);
  assert.match(js, /\/api\/roots\/unpin/);
  assert.match(js, /\/api\/roots\/remove/);
});
