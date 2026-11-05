'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const JSZip = require('../public/vendor/jszip.min.js');
const {
  verifyDigest,
  getUpdateDir,
  executableName,
  extractUpdateZip,
  downloadUpdate,
} = require('../lib/update-download');

async function makeZip(files = { 'view-tool.exe': 'exe-bytes', 'view-tool.blob': 'blob-bytes' }) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'udtest-'));
}

test('verifyDigest 支持 sha256: 前缀并拒绝错误值', () => {
  const hex = 'a'.repeat(64);
  assert.strictEqual(verifyDigest(`sha256:${hex}`, hex), true);
  assert.strictEqual(verifyDigest(hex, hex.toUpperCase()), true);
  assert.strictEqual(verifyDigest(`sha256:${'b'.repeat(64)}`, hex), false);
  assert.strictEqual(verifyDigest(null, hex), false);
});

test('getUpdateDir 拒绝路径穿越和非 semver 版本', () => {
  const root = tmpRoot();
  try {
    assert.strictEqual(
      getUpdateDir('v1.2.3', root),
      path.join(root, '1.2.3'),
    );
    assert.throws(() => getUpdateDir('../evil', root), /无效的版本号/);
    assert.throws(() => getUpdateDir('1.2.3/../../evil', root), /无效的版本号/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('executableName 按平台返回文件名', () => {
  assert.strictEqual(executableName('win32'), 'view-tool.exe');
  assert.strictEqual(executableName('darwin'), 'view-tool');
});

test('extractUpdateZip 只写 exe 和 blob', async () => {
  const zip = await makeZip({
    'view-tool.exe': 'exe-bytes',
    'view-tool.blob': 'blob-bytes',
    '../evil.txt': 'evil',
  });
  const dir = tmpRoot();
  try {
    const { files } = await extractUpdateZip(zip, dir, 'win32');
    assert.deepStrictEqual(files, ['view-tool.exe', 'view-tool.blob']);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'view-tool.exe'), 'utf8'), 'exe-bytes');
    assert.strictEqual(fs.readFileSync(path.join(dir, 'view-tool.blob'), 'utf8'), 'blob-bytes');
    assert.strictEqual(fs.existsSync(path.join(dir, 'evil.txt')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('extractUpdateZip 缺少 blob 时拒绝', async () => {
  const zip = await makeZip({ 'view-tool.exe': 'exe-bytes' });
  const dir = tmpRoot();
  try {
    await assert.rejects(() => extractUpdateZip(zip, dir, 'win32'), /缺少 view-tool\.blob/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('downloadUpdate 校验 SHA256 并解压到 updates/<version>', async () => {
  const zip = await makeZip();
  const digest = `sha256:${crypto.createHash('sha256').update(zip).digest('hex')}`;
  const root = tmpRoot();
  try {
    const result = await downloadUpdate(
      {
        downloadUrl: 'https://github.com/w704793032/view-tool/releases/download/v1.2.3/view-tool-win32-x64-win.zip',
        digest,
        size: zip.length,
      },
      'v1.2.3',
      {
        rootDir: root,
        platform: 'win32',
        fetchImpl: async () => new Response(zip, {
          status: 200,
          headers: { 'content-length': String(zip.length) },
        }),
      },
    );

    assert.strictEqual(result.version, '1.2.3');
    assert.strictEqual(result.dir, path.join(root, '1.2.3'));
    assert.deepStrictEqual(result.files, ['view-tool.exe', 'view-tool.blob']);
    assert.strictEqual(fs.existsSync(path.join(result.dir, 'update.zip')), false);
    assert.strictEqual(fs.readFileSync(path.join(result.dir, 'view-tool.blob'), 'utf8'), 'blob-bytes');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadUpdate 校验失败时删除下载文件', async () => {
  const zip = await makeZip();
  const root = tmpRoot();
  try {
    await assert.rejects(() => downloadUpdate(
      {
        downloadUrl: 'https://github.com/w704793032/view-tool/releases/download/v1.2.3/view-tool-win32-x64-win.zip',
        digest: `sha256:${'0'.repeat(64)}`,
        size: zip.length,
      },
      '1.2.3',
      {
        rootDir: root,
        platform: 'win32',
        fetchImpl: async () => new Response(zip, {
          status: 200,
          headers: { 'content-length': String(zip.length) },
        }),
      },
    ), /SHA256 校验失败/);
    assert.strictEqual(fs.existsSync(path.join(root, '1.2.3', 'update.zip')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('downloadUpdate 拒绝缺少 digest 的资产', async () => {
  await assert.rejects(
    () => downloadUpdate({ downloadUrl: 'https://github.com/x/y.zip' }, '1.2.3', { rootDir: tmpRoot() }),
    /缺少 SHA256/,
  );
});

test('downloadUpdate 拒绝非 GitHub 下载地址', async () => {
  await assert.rejects(
    () => downloadUpdate(
      { downloadUrl: 'https://example.com/update.zip', digest: `sha256:${'a'.repeat(64)}` },
      '1.2.3',
      { rootDir: tmpRoot() },
    ),
    /不受信任/,
  );
});
