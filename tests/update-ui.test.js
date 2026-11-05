'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const STYLES_CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

test('index.html 包含更新提示条和下载按钮', () => {
  assert.match(INDEX_HTML, /id="updateBanner"/);
  assert.match(INDEX_HTML, /id="updateDownloadBtn"/);
  assert.match(INDEX_HTML, /id="updateSkipBtn"/);
  assert.match(INDEX_HTML, /id="updateRevealBtn"/);
});

test('app.js 启动时调用更新检查接口', () => {
  assert.match(APP_JS, /\/api\/update\/check/);
  assert.match(APP_JS, /checkForUpdate\(\)/);
});

test('app.js 下载按钮调用下载和打开目录接口', () => {
  assert.match(APP_JS, /\/api\/update\/download/);
  assert.match(APP_JS, /\/api\/update\/reveal/);
});

test('styles.css 有 update-banner 规则', () => {
  assert.match(STYLES_CSS, /\.update-banner\s*\{/);
  assert.match(STYLES_CSS, /\.update-banner\[hidden\]/);
});
