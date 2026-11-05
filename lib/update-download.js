'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Transform, Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const JSZip = require('../public/vendor/jszip.min.js');
const { userDataDir } = require('./user-paths');
const { normalizeVersion } = require('./update-check');

const MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const TRUSTED_ASSET_HOSTS = new Set(['github.com', 'objects.githubusercontent.com']);

function updateRootDir() {
  try {
    return path.join(userDataDir(), 'updates');
  } catch {
    return path.join(os.tmpdir(), 'view-tool-updates');
  }
}

/** 只接受合法 semver，避免把版本号拼进路径时被 .. 穿越。 */
function getUpdateDir(version, rootDir = updateRootDir()) {
  const normalized = normalizeVersion(version);
  if (!normalized) throw new Error('无效的版本号');
  return path.join(rootDir, normalized);
}

function executableName(platform = process.platform) {
  return platform === 'win32' ? 'view-tool.exe' : 'view-tool';
}

function verifyDigest(expected, actual) {
  if (!expected || !actual) return false;
  const normalized = String(expected).trim().toLowerCase();
  const hex = normalized.startsWith('sha256:') ? normalized.slice(7) : normalized;
  return /^[0-9a-f]{64}$/.test(hex) && hex === String(actual).trim().toLowerCase();
}

function assertTrustedAssetUrl(downloadUrl) {
  let url;
  try {
    url = new URL(downloadUrl);
  } catch {
    throw new Error('更新资产地址无效');
  }
  if (url.protocol !== 'https:' || !TRUSTED_ASSET_HOSTS.has(url.hostname)) {
    throw new Error('更新资产地址不受信任');
  }
}

async function downloadAsset(asset, destFile, { fetchImpl = fetch } = {}) {
  if (!asset || !asset.downloadUrl) throw new Error('更新资产地址为空');
  assertTrustedAssetUrl(asset.downloadUrl);

  const signal = typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
    : undefined;
  const response = await fetchImpl(asset.downloadUrl, { redirect: 'follow', signal });
  if (!response.ok || !response.body) {
    throw new Error(`下载更新失败（HTTP ${response.status}）`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error('更新包超过大小限制');
  }

  const hash = crypto.createHash('sha256');
  let total = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > MAX_DOWNLOAD_BYTES) {
        callback(new Error('更新包超过大小限制'));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(response.body),
    meter,
    fs.createWriteStream(destFile),
  );

  return { size: total, sha256: hash.digest('hex') };
}

/**
 * 只从 zip 根目录取 exe 和 blob，其他文件一律忽略，避免 zip slip / 意外覆盖。
 */
async function extractUpdateZip(zipBuffer, destDir, platform = process.platform) {
  const zip = await JSZip.loadAsync(zipBuffer);
  const exeName = executableName(platform);
  const expected = [exeName, 'view-tool.blob'];
  await fsp.mkdir(destDir, { recursive: true });

  const files = [];
  for (const name of expected) {
    const entry = zip.file(name);
    if (!entry) throw new Error(`更新包缺少 ${name}`);
    const data = await entry.async('nodebuffer');
    if (!data || data.length === 0) throw new Error(`更新包里的 ${name} 为空`);
    if (data.length > MAX_DOWNLOAD_BYTES) throw new Error(`更新包里的 ${name} 超过大小限制`);
    const target = path.join(destDir, name);
    await fsp.writeFile(target, data);
    if (name === exeName) {
      try { await fsp.chmod(target, 0o755); } catch { /* Windows 忽略权限位 */ }
    }
    files.push(name);
  }
  return { files };
}

async function downloadUpdate(asset, version, options = {}) {
  const normalized = normalizeVersion(version);
  if (!normalized) throw new Error('无效的版本号');
  if (!asset || !asset.digest) {
    throw new Error('发布资产缺少 SHA256 校验和，已取消自动下载');
  }

  const root = options.rootDir || updateRootDir();
  const dir = getUpdateDir(normalized, root);
  await fsp.mkdir(dir, { recursive: true });
  const zipPath = path.join(dir, 'update.zip');

  try {
    const result = await downloadAsset(asset, zipPath, { fetchImpl: options.fetchImpl });
    if (!verifyDigest(asset.digest, result.sha256)) {
      throw new Error('更新包 SHA256 校验失败');
    }
    const buffer = await fsp.readFile(zipPath);
    const { files } = await extractUpdateZip(buffer, dir, options.platform);
    await fsp.rm(zipPath, { force: true });
    return {
      version: normalized,
      dir,
      files,
      size: result.size,
      digest: result.sha256,
    };
  } catch (err) {
    try { await fsp.rm(zipPath, { force: true }); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = {
  MAX_DOWNLOAD_BYTES,
  updateRootDir,
  getUpdateDir,
  executableName,
  verifyDigest,
  extractUpdateZip,
  downloadUpdate,
};
