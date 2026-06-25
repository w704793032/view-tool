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

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`server timeout: ${chunks.join('')}`));
    }, 5000);
    child.stdout.on('data', (buf) => {
      const match = buf.toString().match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve({ child, baseUrl: `http://localhost:${match[1]}` });
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited ${code}: ${chunks.join('')}`));
    });
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
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
    assert.strictEqual(res.data.error.code, 'NOT_FOUND');
  } finally {
    await stopServer(child);
  }
});
