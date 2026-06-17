'use strict';

// 回归保护: view-tool 历史上给 HTML 预览 iframe 写过 sandbox="allow-same-origin",
// 这会禁用脚本, 导致 tailwind.js 这类运行时工具类的页面布局全部崩溃
// (例如 slidagent 生成的 page-1.pptx.html)。这两条断言锁住"脚本可用、类名正确"。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const STYLES_CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

test('HTML 预览 iframe 的 sandbox 必须包含 allow-scripts', () => {
  // 抓取 renderText 里 iframe.setAttribute('sandbox', '...') 那一行的字面量
  const m = APP_JS.match(/iframe\.setAttribute\(\s*'sandbox'\s*,\s*'([^']+)'\s*\)/);
  assert.ok(m, '应该能在 app.js 里找到 iframe sandbox 设置');
  const value = m[1].trim().split(/\s+/).sort().join(' ');
  assert.ok(value.includes('allow-scripts'),
    `sandbox 必须允许脚本执行, 当前值: "${value}"`);
});

test('HTML 预览 iframe 的 sandbox 不能再用 allow-same-origin', () => {
  // 历史上的 bug 写法; 显式禁掉, 防止有人把同源能力随手加回来
  const m = APP_JS.match(/iframe\.setAttribute\(\s*'sandbox'\s*,\s*'([^']+)'\s*\)/);
  assert.ok(m);
  const value = m[1];
  assert.ok(!value.includes('allow-same-origin'),
    '不要再加 allow-same-origin —— 它既冗余又让 iframe 与父页同源, 反而比纯 allow-scripts 危险');
});

test('HTML 预览 iframe 应该用 .html-preview 类名 (不要再用 .pdf-preview)', () => {
  assert.match(APP_JS, /iframe\.className\s*=\s*'html-preview'/,
    'iframe.className 应为 html-preview');
  assert.ok(!/iframe\.className\s*=\s*'pdf-preview'/.test(APP_JS),
    'iframe.className 不应再用语义错误的 pdf-preview');
});

test('styles.css 里有 .html-preview 规则', () => {
  assert.match(STYLES_CSS, /\.html-preview\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/,
    'styles.css 需要 .html-preview { width: 100%; height: 100%; ... }');
});
