# Root History Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toolbar root-directory switcher backed by local `config.json` history and pinned roots.

**Architecture:** Keep the app's single active `rootDir` model. Add pure root-list helpers under `lib/root-history.js`, use them from `ConfigStore` and `server.js`, then render a lightweight front-end dropdown that calls the new APIs and the existing root-switch API.

**Tech Stack:** Node.js built-in test runner, Express 4, vanilla HTML/CSS/JavaScript.

## Global Constraints

- The app still has one active `rootDir`; file APIs remain scoped by the existing path guard.
- Root history is local-only in `config.json`; it is not cross-device sync and must not be committed as user data.
- `recentRoots` contains absolute path strings, newest first, deduplicated after `path.resolve`.
- `recentRoots` keeps at most 10 entries.
- `pinnedRoots` contains absolute path strings, deduplicated after `path.resolve`, preserving user order.
- `--root` CLI overrides are temporary and must not automatically write history during startup.
- `pin` must require an existing directory.
- `unpin` and `remove` must work even if the path no longer exists.

---

## File Structure

- Create `lib/root-history.js`: pure helpers for normalizing root lists and applying list operations.
- Modify `lib/config-store.js`: defaults include empty `recentRoots` and `pinnedRoots`; `load()` normalizes arrays.
- Modify `server.js`: return root lists from `/api/config`, record recent roots after successful UI root changes, and add `POST /api/roots/pin`, `/api/roots/unpin`, `/api/roots/remove`.
- Modify `public/index.html`: add the switch button and dropdown container to the toolbar.
- Modify `public/app.js`: store root lists, render dropdown, call new API endpoints, and keep state in sync after root changes.
- Modify `public/styles.css`: style the switcher dropdown in the existing quiet toolbar style.
- Modify `README.md`: document config fields and API additions.
- Create `tests/root-history.test.js`: unit-test normalization and list operations.
- Modify `tests/config-store.test.js`: verify old configs load with empty lists and invalid list values are normalized.
- Create `tests/root-switcher-ui.test.js`: static checks for required markup and CSS selectors.

## Task 1: Root History Helpers And Config Normalization

**Files:**
- Create: `lib/root-history.js`
- Create: `tests/root-history.test.js`
- Modify: `lib/config-store.js`
- Modify: `tests/config-store.test.js`

**Interfaces:**
- Produces: `normalizeRootList(value, { limit } = {}) -> string[]`
- Produces: `normalizeRootConfig(cfg) -> object`
- Produces: `addRecentRoot(cfg, rootDir, limit = 10) -> object`
- Produces: `pinRoot(cfg, rootDir) -> object`
- Produces: `unpinRoot(cfg, rootDir) -> object`
- Produces: `removeRoot(cfg, rootDir) -> object`
- Consumes: Node `path.resolve`

- [ ] **Step 1: Write failing root-history helper tests**

Add `tests/root-history.test.js`:

```js
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
```

- [ ] **Step 2: Run helper tests to verify RED**

Run: `npm.cmd test -- tests/root-history.test.js`

Expected: FAIL with `Cannot find module '../lib/root-history'`.

- [ ] **Step 3: Implement root-history helpers**

Create `lib/root-history.js`:

```js
'use strict';

const path = require('node:path');

const DEFAULT_RECENT_LIMIT = 10;

function normalizeRootList(value, opts = {}) {
  if (!Array.isArray(value)) return [];
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : null;
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0) continue;
    const abs = path.resolve(item);
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function normalizeRootConfig(cfg) {
  return {
    ...cfg,
    recentRoots: normalizeRootList(cfg.recentRoots, { limit: DEFAULT_RECENT_LIMIT }),
    pinnedRoots: normalizeRootList(cfg.pinnedRoots),
  };
}

function addRecentRoot(cfg, rootDir, limit = DEFAULT_RECENT_LIMIT) {
  const abs = path.resolve(rootDir);
  return {
    ...cfg,
    recentRoots: normalizeRootList([abs, ...(cfg.recentRoots || [])], { limit }),
    pinnedRoots: normalizeRootList(cfg.pinnedRoots),
  };
}

function pinRoot(cfg, rootDir) {
  const abs = path.resolve(rootDir);
  return {
    ...cfg,
    recentRoots: normalizeRootList(cfg.recentRoots, { limit: DEFAULT_RECENT_LIMIT }),
    pinnedRoots: normalizeRootList([...(cfg.pinnedRoots || []), abs]),
  };
}

function unpinRoot(cfg, rootDir) {
  const abs = path.resolve(rootDir);
  return {
    ...cfg,
    recentRoots: normalizeRootList(cfg.recentRoots, { limit: DEFAULT_RECENT_LIMIT }),
    pinnedRoots: normalizeRootList(cfg.pinnedRoots).filter((item) => item !== abs),
  };
}

function removeRoot(cfg, rootDir) {
  const abs = path.resolve(rootDir);
  return {
    ...cfg,
    recentRoots: normalizeRootList(cfg.recentRoots, { limit: DEFAULT_RECENT_LIMIT }).filter((item) => item !== abs),
    pinnedRoots: normalizeRootList(cfg.pinnedRoots).filter((item) => item !== abs),
  };
}

module.exports = {
  DEFAULT_RECENT_LIMIT,
  normalizeRootList,
  normalizeRootConfig,
  addRecentRoot,
  pinRoot,
  unpinRoot,
  removeRoot,
};
```

- [ ] **Step 4: Run helper tests to verify GREEN**

Run: `npm.cmd test -- tests/root-history.test.js`

Expected: PASS.

- [ ] **Step 5: Write failing ConfigStore tests**

Append to `tests/config-store.test.js`:

```js
test('load old config supplies empty root history lists', () => {
  const p = tmpConfigPath();
  fs.writeFileSync(p, JSON.stringify({ rootDir: 'D:\\y', port: 4000 }));
  const store = new ConfigStore(p);
  const cfg = store.load();

  assert.deepStrictEqual(cfg.recentRoots, []);
  assert.deepStrictEqual(cfg.pinnedRoots, []);
});

test('load normalizes root history lists from config file', () => {
  const p = tmpConfigPath();
  fs.writeFileSync(p, JSON.stringify({
    recentRoots: ['a', 'a', '', 12],
    pinnedRoots: ['b', 'b', null],
  }));
  const store = new ConfigStore(p);
  const cfg = store.load();

  assert.deepStrictEqual(cfg.recentRoots, [path.resolve('a')]);
  assert.deepStrictEqual(cfg.pinnedRoots, [path.resolve('b')]);
});
```

- [ ] **Step 6: Run ConfigStore tests to verify RED**

Run: `npm.cmd test -- tests/config-store.test.js`

Expected: FAIL because `recentRoots` and `pinnedRoots` are not normalized yet.

- [ ] **Step 7: Normalize ConfigStore output**

Update `lib/config-store.js`:

```js
const { normalizeRootConfig } = require('./root-history');

const DEFAULTS = {
  rootDir: '',
  recentRoots: [],
  pinnedRoots: [],
  port: 3000,
  maxPreviewSize: 5242880,
  version: 1,
};
```

Change `load()` return to:

```js
    return normalizeRootConfig({
      ...DEFAULTS,
      ...fromFile,
      ...this.cliOverrides,
    });
```

- [ ] **Step 8: Run Task 1 tests**

Run: `npm.cmd test -- tests/root-history.test.js tests/config-store.test.js`

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add lib/root-history.js lib/config-store.js tests/root-history.test.js tests/config-store.test.js
git commit -m "feat: normalize root history config"
```

## Task 2: Root History Server APIs

**Files:**
- Modify: `server.js`
- Create: `tests/server-root-history.test.js`

**Interfaces:**
- Consumes: helpers from `lib/root-history.js`
- Produces: `GET /api/config` response includes `recentRoots` and `pinnedRoots`
- Produces: `POST /api/config` records successful UI root changes in `recentRoots`
- Produces: `POST /api/roots/pin`
- Produces: `POST /api/roots/unpin`
- Produces: `POST /api/roots/remove`

- [ ] **Step 1: Write failing server tests by spawning the app**

Create `tests/server-root-history.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function waitForConfig(baseUrl) {
  const deadline = Date.now() + 5000;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/config`);
      if (res.ok) return res.json();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastErr || new Error('server did not start');
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function startServer(configPath, rootDir) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [
    'server.js',
    '--config',
    configPath,
    '--root',
    rootDir,
    '--port',
    String(port),
    '--no-open',
  ], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks = [];
  child.stdout.on('data', (buf) => chunks.push(buf.toString()));
  child.stderr.on('data', (buf) => chunks.push(buf.toString()));
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`server timeout: ${chunks.join('')}`)), 5000);
    child.stdout.on('data', (buf) => {
      const text = buf.toString();
      const match = text.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve({ child, baseUrl: `http://localhost:${match[1]}` });
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited ${code}: ${chunks.join('')}`));
    });
  });
  return ready;
}

async function stopServer(child) {
  if (child.exitCode != null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

async function postJson(baseUrl, url, body) {
  const res = await fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test('GET /api/config returns root history lists', async () => {
  const root = tempDir('view-root-');
  const configPath = path.join(tempDir('view-config-'), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ recentRoots: [root], pinnedRoots: [root] }));
  const { child, baseUrl } = await startServer(configPath, root);
  try {
    const cfg = await waitForConfig(baseUrl);
    assert.deepStrictEqual(cfg.recentRoots, [root]);
    assert.deepStrictEqual(cfg.pinnedRoots, [root]);
  } finally {
    await stopServer(child);
  }
});

test('POST /api/config records successful root switch in recentRoots', async () => {
  const rootA = tempDir('view-root-a-');
  const rootB = tempDir('view-root-b-');
  const configPath = path.join(tempDir('view-config-'), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ rootDir: rootA }));
  const { child, baseUrl } = await startServer(configPath, rootA);
  try {
    const res = await postJson(baseUrl, '/api/config', { rootDir: rootB });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.rootDir, rootB);
    assert.strictEqual(res.data.recentRoots[0], rootB);
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(saved.recentRoots[0], rootB);
  } finally {
    await stopServer(child);
  }
});

test('POST /api/config failure does not write invalid path to recentRoots', async () => {
  const root = tempDir('view-root-');
  const configPath = path.join(tempDir('view-config-'), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ rootDir: root }));
  const { child, baseUrl } = await startServer(configPath, root);
  try {
    const missing = path.join(root, 'missing');
    const res = await postJson(baseUrl, '/api/config', { rootDir: missing });
    assert.strictEqual(res.status, 404);
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepStrictEqual(saved.recentRoots || [], []);
  } finally {
    await stopServer(child);
  }
});

test('root list management endpoints pin, unpin, and remove paths', async () => {
  const root = tempDir('view-root-');
  const other = tempDir('view-root-other-');
  const configPath = path.join(tempDir('view-config-'), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ rootDir: root, recentRoots: [other] }));
  const { child, baseUrl } = await startServer(configPath, root);
  try {
    let res = await postJson(baseUrl, '/api/roots/pin', { rootDir: other });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.data.pinnedRoots, [other]);

    res = await postJson(baseUrl, '/api/roots/unpin', { rootDir: other });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.data.pinnedRoots, []);

    res = await postJson(baseUrl, '/api/roots/remove', { rootDir: other });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.data.recentRoots, []);
  } finally {
    await stopServer(child);
  }
});

test('POST /api/roots/pin rejects missing directories', async () => {
  const root = tempDir('view-root-');
  const configPath = path.join(tempDir('view-config-'), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ rootDir: root }));
  const { child, baseUrl } = await startServer(configPath, root);
  try {
    const res = await postJson(baseUrl, '/api/roots/pin', { rootDir: path.join(root, 'missing') });
    assert.strictEqual(res.status, 404);
  } finally {
    await stopServer(child);
  }
});
```

- [ ] **Step 2: Run server tests to verify RED**

Run: `npm.cmd test -- tests/server-root-history.test.js`

Expected: FAIL because `/api/config` does not return lists and `/api/roots/*` endpoints do not exist.

- [ ] **Step 3: Implement server root-history APIs**

Update `server.js` imports:

```js
const {
  addRecentRoot,
  pinRoot,
  unpinRoot,
  removeRoot,
} = require('./lib/root-history');
```

Add helper inside `start()` after `app.use(express.json())`:

```js
  function configPayload() {
    return {
      rootDir,
      recentRoots: config.recentRoots || [],
      pinnedRoots: config.pinnedRoots || [],
      version: config.version,
      port,
    };
  }
```

Change `GET /api/config` to `res.json(configPayload())`.

After successful `POST /api/config` validation:

```js
    rootDir = abs;
    Object.assign(config, addRecentRoot({ ...config, rootDir: abs }, abs));
    store.save(config);
    res.json(configPayload());
```

Add list endpoints before `/api/tree`:

```js
  function readRootBody(req, res) {
    const value = req.body && req.body.rootDir;
    if (typeof value !== 'string' || value.length === 0) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'rootDir 必填' } });
      return null;
    }
    return path.resolve(value);
  }

  app.post('/api/roots/pin', (req, res) => {
    const abs = readRootBody(req, res);
    if (!abs) return;
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '该路径不存在' } });
    }
    if (!fs.statSync(abs).isDirectory()) {
      return res.status(400).json({ error: { code: 'NOT_A_DIRECTORY', message: '该路径不是一个目录' } });
    }
    Object.assign(config, pinRoot(config, abs));
    store.save(config);
    res.json(configPayload());
  });

  app.post('/api/roots/unpin', (req, res) => {
    const abs = readRootBody(req, res);
    if (!abs) return;
    Object.assign(config, unpinRoot(config, abs));
    store.save(config);
    res.json(configPayload());
  });

  app.post('/api/roots/remove', (req, res) => {
    const abs = readRootBody(req, res);
    if (!abs) return;
    Object.assign(config, removeRoot(config, abs));
    store.save(config);
    res.json(configPayload());
  });
```

- [ ] **Step 4: Run server tests to verify GREEN**

Run: `npm.cmd test -- tests/server-root-history.test.js`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add server.js tests/server-root-history.test.js
git commit -m "feat: add root history api"
```

## Task 3: Toolbar Root Switcher UI

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Create: `tests/root-switcher-ui.test.js`

**Interfaces:**
- Consumes: `/api/config`, `/api/config` POST, `/api/roots/pin`, `/api/roots/unpin`, `/api/roots/remove`
- Produces: DOM elements `#switchRootBtn` and `#rootMenu`
- Produces: CSS selectors `.root-switch`, `.root-menu`, `.root-menu-item`, `.root-menu-action`

- [ ] **Step 1: Write failing static UI tests**

Create `tests/root-switcher-ui.test.js`:

```js
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
```

- [ ] **Step 2: Run UI tests to verify RED**

Run: `npm.cmd test -- tests/root-switcher-ui.test.js`

Expected: FAIL because the toolbar markup, CSS, and app functions are not present.

- [ ] **Step 3: Add toolbar markup**

Update `public/index.html` toolbar:

```html
    <span class="toolbar-label">📁 根目录：</span>
    <span id="rootDirLabel" class="root-dir">—</span>
    <div class="root-switch">
      <button id="switchRootBtn" class="btn" type="button" aria-haspopup="true" aria-expanded="false">切换</button>
      <div id="rootMenu" class="root-menu" hidden></div>
    </div>
    <button id="changeRootBtn" class="btn">修改</button>
```

- [ ] **Step 4: Add root switcher state and functions**

Update `public/app.js` state:

```js
  recentRoots: [],
  pinnedRoots: [],
```

Add after `changeRootDir()`:

```js
function applyConfig(cfg) {
  state.rootDir = cfg.rootDir;
  state.recentRoots = Array.isArray(cfg.recentRoots) ? cfg.recentRoots : [];
  state.pinnedRoots = Array.isArray(cfg.pinnedRoots) ? cfg.pinnedRoots : [];
  document.getElementById('rootDirLabel').textContent = cfg.rootDir;
  document.getElementById('configBadge').textContent = `端口 ${cfg.port}`;
}

function rootLeaf(root) {
  return root.split(/[\\/]/).filter(Boolean).pop() || root;
}

function closeRootMenu() {
  const menu = document.getElementById('rootMenu');
  const btn = document.getElementById('switchRootBtn');
  if (!menu || !btn) return;
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

function renderRootMenu() {
  const menu = document.getElementById('rootMenu');
  const pinned = state.pinnedRoots;
  const pinnedSet = new Set(pinned);
  const recent = state.recentRoots.filter((root) => !pinnedSet.has(root));
  const sections = [
    ['置顶', pinned],
    ['最近', recent],
  ].filter(([, roots]) => roots.length > 0);

  if (sections.length === 0) {
    menu.innerHTML = '<div class="root-menu-empty">暂无历史路径</div>';
    return;
  }

  menu.innerHTML = '';
  for (const [title, roots] of sections) {
    const heading = document.createElement('div');
    heading.className = 'root-menu-heading';
    heading.textContent = title;
    menu.appendChild(heading);
    for (const root of roots) {
      const row = document.createElement('div');
      row.className = 'root-menu-item';
      if (root === state.rootDir) row.classList.add('active');

      const main = document.createElement('button');
      main.className = 'root-menu-main';
      main.type = 'button';
      main.title = root;
      main.dataset.root = root;
      main.innerHTML = `<span class="root-menu-name">${escapeHtml(rootLeaf(root))}</span><span class="root-menu-path">${escapeHtml(root)}</span>`;

      const pin = document.createElement('button');
      pin.className = 'root-menu-action';
      pin.type = 'button';
      pin.title = pinnedSet.has(root) ? '取消置顶' : '置顶';
      pin.dataset.action = pinnedSet.has(root) ? 'unpin' : 'pin';
      pin.dataset.root = root;
      pin.textContent = pinnedSet.has(root) ? '★' : '☆';

      const remove = document.createElement('button');
      remove.className = 'root-menu-action';
      remove.type = 'button';
      remove.title = '移除';
      remove.dataset.action = 'remove';
      remove.dataset.root = root;
      remove.textContent = '×';

      row.append(main, pin, remove);
      menu.appendChild(row);
    }
  }
}

async function syncRootList(url, rootDir) {
  const cfg = await apiPost(url, { rootDir });
  applyConfig(cfg);
  renderRootMenu();
}

function setupRootSwitcher() {
  const btn = document.getElementById('switchRootBtn');
  const menu = document.getElementById('rootMenu');
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    renderRootMenu();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });

  menu.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const actionBtn = ev.target.closest('.root-menu-action');
    if (actionBtn) {
      const root = actionBtn.dataset.root;
      const action = actionBtn.dataset.action;
      try {
        if (action === 'pin') await syncRootList('/api/roots/pin', root);
        if (action === 'unpin') await syncRootList('/api/roots/unpin', root);
        if (action === 'remove') await syncRootList('/api/roots/remove', root);
      } catch (err) {
        showToast(err.message, { kind: 'error', duration: 4000 });
      }
      return;
    }

    const item = ev.target.closest('.root-menu-main');
    if (!item) return;
    const root = item.dataset.root;
    if (root === state.rootDir) {
      closeRootMenu();
      return;
    }
    try {
      await changeRootDir(root);
      showToast(`已切换到：${rootLeaf(root)}`, { kind: 'success', duration: 2000 });
    } catch (err) {
      showToast(`切换失败：${err.message}`, { kind: 'error', duration: 4000 });
      renderRootMenu();
    }
  });

  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.root-switch')) closeRootMenu();
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeRootMenu();
  });
}
```

Also change `loadConfig()` to call `applyConfig(cfg)`, and change `changeRootDir()` to call `applyConfig(cfg)` before resetting the tree state and `closeRootMenu()` after the preview reset.

Call `setupRootSwitcher()` in `main()` before `setupModal()`.

- [ ] **Step 5: Add root switcher CSS**

Append to `public/styles.css`:

```css
.root-switch { position: relative; }
.root-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 900;
  width: min(520px, calc(100vw - 32px));
  max-height: 360px;
  overflow: auto;
  background: white;
  border: 1px solid #d6d6d6;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.16);
  padding: 6px;
}
.root-menu[hidden] { display: none; }
.root-menu-heading {
  padding: 6px 8px 3px;
  color: #777;
  font-size: 12px;
  font-weight: 600;
}
.root-menu-empty {
  padding: 12px;
  color: #777;
  font-size: 13px;
}
.root-menu-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px 32px;
  align-items: center;
  gap: 4px;
  border-radius: 4px;
}
.root-menu-item.active { background: #eef4fb; }
.root-menu-main {
  min-width: 0;
  padding: 7px 8px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.root-menu-main:hover,
.root-menu-action:hover { background: #eef2f7; }
.root-menu-name {
  display: block;
  color: #222;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.root-menu-path {
  display: block;
  color: #777;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.root-menu-action {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #555;
  cursor: pointer;
  font-size: 15px;
}
```

- [ ] **Step 6: Run UI tests to verify GREEN**

Run: `npm.cmd test -- tests/root-switcher-ui.test.js`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add public/index.html public/app.js public/styles.css tests/root-switcher-ui.test.js
git commit -m "feat: add root switcher ui"
```

## Task 4: Documentation And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-25-root-history-implementation.md`

**Interfaces:**
- Consumes: final behavior from Tasks 1-3.
- Produces: README docs for config fields and APIs.

- [ ] **Step 1: Update README feature, config, and API docs**

Update README to mention:

```md
- **根目录历史快速切换**：工具栏“切换”按钮展示置顶路径和最近路径，点击即可切回常用目录。
```

Add API rows:

```md
| `POST` | `/api/roots/pin` | 置顶一个存在的根目录，body `{ "rootDir": "<绝对路径>" }` |
| `POST` | `/api/roots/unpin` | 取消置顶根目录，body `{ "rootDir": "<绝对路径>" }` |
| `POST` | `/api/roots/remove` | 从历史和置顶列表移除根目录，body `{ "rootDir": "<绝对路径>" }` |
```

Add config rows:

```md
| `recentRoots` | string[] | 最近成功通过 UI 切换过的根目录，最多 10 条 | `[]` |
| `pinnedRoots` | string[] | 用户置顶的常用根目录 | `[]` |
```

- [ ] **Step 2: Run all tests**

Run: `npm.cmd test`

Expected: PASS with all tests passing.

- [ ] **Step 3: Run targeted static verification**

Run: `npm.cmd test -- tests/root-history.test.js tests/config-store.test.js tests/server-root-history.test.js tests/root-switcher-ui.test.js`

Expected: PASS.

- [ ] **Step 4: Inspect git diff**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Commit Task 4**

```bash
git add README.md docs/superpowers/plans/2026-06-25-root-history-implementation.md
git commit -m "docs: document root history switching"
```

## Self-Review

- Spec coverage: Tasks cover config persistence, root history dedupe and cap, pin/unpin/remove behavior, single-root API model, front-end toolbar switcher, invalid path handling, README updates, and final verification.
- Placeholder scan: No `TBD`, `TODO`, or incomplete implementation placeholders are present.
- Type consistency: Helper names and endpoint names match across tasks; front-end state uses `recentRoots` and `pinnedRoots` consistently.
