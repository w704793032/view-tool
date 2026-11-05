'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseVersion,
  normalizeVersion,
  compareVersions,
  isNewerVersion,
  chooseAsset,
  checkForUpdates,
} = require('../lib/update-check');
const { APP_VERSION } = require('../lib/version');
const pkg = require('../package.json');

function tmpCachePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'uctest-')), 'update-check.json');
}

function releaseFixture(overrides = {}) {
  return {
    tag_name: 'v0.3.1',
    name: 'view-tool v0.3.1',
    html_url: 'https://github.com/w704793032/view-tool/releases/tag/v0.3.1',
    published_at: '2026-11-06T00:00:00Z',
    body: 'release notes',
    assets: [
      {
        name: 'view-tool-win32-x64-win.zip',
        size: 1234,
        digest: 'sha256:abc',
        browser_download_url: 'https://github.com/w704793032/view-tool/releases/download/v0.3.1/view-tool-win32-x64-win.zip',
      },
      {
        name: 'view-tool-darwin-arm64-mac.zip',
        size: 456,
        digest: 'sha256:def',
        browser_download_url: 'https://github.com/w704793032/view-tool/releases/download/v0.3.1/view-tool-darwin-arm64-mac.zip',
      },
    ],
    ...overrides,
  };
}

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  };
}

test('version 解析与比较支持 v 前缀、预发布号', () => {
  assert.strictEqual(APP_VERSION, pkg.version);
  assert.deepEqual(parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: '' });
  assert.strictEqual(normalizeVersion('v1.2.3-rc.1'), '1.2.3-rc.1');
  assert.strictEqual(normalizeVersion('not-a-version'), null);

  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
  assert.ok(compareVersions('v1.0.0', '1.0.0') === 0);
  assert.ok(compareVersions('1.0.0-rc.1', '1.0.0') < 0);
  assert.ok(compareVersions('1.0.0-rc.2', '1.0.0-rc.1') > 0);
  assert.ok(isNewerVersion('v0.10.0', '0.9.9'));
  assert.ok(!isNewerVersion('v0.3.0', '0.3.0'));
});

test('chooseAsset 按平台和架构选择 zip', () => {
  const release = { assets: releaseFixture().assets };
  assert.strictEqual(chooseAsset(release, 'win32', 'x64').name, 'view-tool-win32-x64-win.zip');
  assert.strictEqual(chooseAsset(release, 'darwin', 'arm64').name, 'view-tool-darwin-arm64-mac.zip');
  assert.strictEqual(chooseAsset(release, 'linux', 'x64'), null);
});

test('checkForUpdates 发现新版本并写入缓存', async () => {
  const cachePath = tmpCachePath();
  let calls = 0;
  const result = await checkForUpdates({
    cachePath,
    currentVersion: '0.3.0',
    platform: 'win32',
    arch: 'x64',
    now: () => 1000,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(releaseFixture(), { headers: { etag: '"abc"' } });
    },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.latestVersion, '0.3.1');
  assert.strictEqual(result.updateAvailable, true);
  assert.strictEqual(result.asset.name, 'view-tool-win32-x64-win.zip');
  assert.strictEqual(result.asset.digest, 'sha256:abc');
  assert.strictEqual(calls, 1);
  assert.ok(fs.existsSync(cachePath));
});

test('缓存有效期内的重复检查不再请求 GitHub', async () => {
  const cachePath = tmpCachePath();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(releaseFixture());
  };

  await checkForUpdates({ cachePath, currentVersion: '0.3.0', platform: 'win32', arch: 'x64', now: () => 1000, fetchImpl });
  const second = await checkForUpdates({ cachePath, currentVersion: '0.3.0', platform: 'win32', arch: 'x64', now: () => 2000, fetchImpl });

  assert.strictEqual(calls, 1);
  assert.strictEqual(second.latestVersion, '0.3.1');
  assert.strictEqual(second.updateAvailable, true);
});

test('force 检查携带 ETag，304 复用缓存', async () => {
  const cachePath = tmpCachePath();
  let calls = 0;
  let receivedEtag = null;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    receivedEtag = options.headers['If-None-Match'];
    if (calls === 1) {
      return jsonResponse(releaseFixture(), { headers: { etag: '"abc"' } });
    }
    return {
      ok: false,
      status: 304,
      headers: new Headers({ etag: '"abc"' }),
      json: async () => ({}),
    };
  };

  await checkForUpdates({ cachePath, currentVersion: '0.3.0', platform: 'win32', arch: 'x64', now: () => 1000, fetchImpl });
  const second = await checkForUpdates({
    cachePath, currentVersion: '0.3.0', platform: 'win32', arch: 'x64', now: () => 2000, force: true, fetchImpl,
  });

  assert.strictEqual(calls, 2);
  assert.strictEqual(receivedEtag, '"abc"');
  assert.strictEqual(second.latestVersion, '0.3.1');
  assert.strictEqual(second.ok, true);
});

test('403/429 返回 rate_limited 而不是抛错', async () => {
  const cachePath = tmpCachePath();
  const reset = 5000;
  const result = await checkForUpdates({
    cachePath,
    currentVersion: '0.3.0',
    platform: 'win32',
    arch: 'x64',
    now: () => 1000,
    fetchImpl: async () => jsonResponse(
      { message: 'rate limited' },
      { status: 403, headers: { 'x-ratelimit-reset': String(reset) } },
    ),
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'rate_limited');
  assert.strictEqual(result.retryAt, reset * 1000);
  assert.strictEqual(result.updateAvailable, false);
});

test('网络异常与无效 tag 不抛错', async () => {
  const cachePath = tmpCachePath();
  const network = await checkForUpdates({
    cachePath,
    currentVersion: '0.3.0',
    platform: 'win32',
    arch: 'x64',
    now: () => 1000,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.strictEqual(network.ok, false);
  assert.strictEqual(network.reason, 'network_error');

  const invalid = await checkForUpdates({
    cachePath: tmpCachePath(),
    currentVersion: '0.3.0',
    platform: 'win32',
    arch: 'x64',
    now: () => 1000,
    fetchImpl: async () => jsonResponse(releaseFixture({ tag_name: 'latest' })),
  });
  assert.strictEqual(invalid.ok, false);
  assert.strictEqual(invalid.reason, 'invalid_release');
});

test('当前已是最新版本时不提示更新', async () => {
  const cachePath = tmpCachePath();
  const result = await checkForUpdates({
    cachePath,
    currentVersion: '0.3.1',
    platform: 'win32',
    arch: 'x64',
    now: () => 1000,
    fetchImpl: async () => jsonResponse(releaseFixture()),
  });
  assert.strictEqual(result.updateAvailable, false);
  assert.strictEqual(result.latestVersion, '0.3.1');
});
