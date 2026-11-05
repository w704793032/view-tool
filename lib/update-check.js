'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { APP_VERSION } = require('./version');
const { userDataDir } = require('./user-paths');

const REPO = 'w704793032/view-tool';
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const RATE_LIMIT_FALLBACK_MS = 60 * 60 * 1000;

// 按缓存文件路径分别缓存，方便测试使用独立目录，也避免源码/SEA 模式互相污染。
const memoryCaches = new Map();
const inflightChecks = new Map();

function parseVersion(input) {
  const value = String(input == null ? '' : input).trim().replace(/^v/i, '');
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function normalizeVersion(input) {
  const parsed = parseVersion(input);
  if (!parsed) return null;
  return `${parsed.major}.${parsed.minor}.${parsed.patch}${parsed.prerelease ? `-${parsed.prerelease}` : ''}`;
}

function comparePrerelease(a, b) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const as = a.split('.');
  const bs = b.split('.');
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    if (as[i] === undefined) return -1;
    if (bs[i] === undefined) return 1;
    const an = /^\d+$/.test(as[i]);
    const bn = /^\d+$/.test(bs[i]);
    if (an && bn) {
      const diff = Number(as[i]) - Number(bs[i]);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (an) {
      return -1;
    } else if (bn) {
      return 1;
    } else if (as[i] !== bs[i]) {
      return as[i] < bs[i] ? -1 : 1;
    }
  }
  return 0;
}

/** 返回 <0 / 0 / >0；无法解析的版本一律视为最旧。 */
function compareVersions(a, b) {
  const pa = typeof a === 'string' ? parseVersion(a) : a;
  const pb = typeof b === 'string' ? parseVersion(b) : b;
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (const key of ['major', 'minor', 'patch']) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1;
  }
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

function isNewerVersion(latest, current) {
  return compareVersions(latest, current) > 0;
}

function platformTarget(platform) {
  if (platform === 'win32') return 'win';
  if (platform === 'darwin') return 'mac';
  return null;
}

function chooseAsset(release, platform = process.platform, arch = process.arch) {
  const target = platformTarget(platform);
  if (!target || !release || !Array.isArray(release.assets)) return null;
  const expected = `view-tool-${platform}-${arch}-${target}.zip`;
  return release.assets.find((asset) => asset.name === expected) || null;
}

function summarizeRelease(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const version = normalizeVersion(raw.tag_name);
  if (!version) return null;
  const releaseUrl = typeof raw.html_url === 'string' && /^https:\/\/github\.com\//.test(raw.html_url)
    ? raw.html_url
    : RELEASES_PAGE;
  const assets = Array.isArray(raw.assets)
    ? raw.assets
      .filter((asset) => asset && typeof asset.name === 'string')
      .map((asset) => ({
        name: asset.name,
        size: Number(asset.size) || 0,
        digest: typeof asset.digest === 'string' ? asset.digest : null,
        downloadUrl: typeof asset.browser_download_url === 'string' ? asset.browser_download_url : '',
      }))
    : [];
  return {
    tagName: raw.tag_name,
    version,
    name: raw.name || raw.tag_name,
    releaseUrl,
    publishedAt: raw.published_at || null,
    notes: typeof raw.body === 'string' ? raw.body.slice(0, 4000) : '',
    assets,
  };
}

function defaultCachePath() {
  try {
    return path.join(userDataDir(), 'update-check.json');
  } catch {
    return null;
  }
}

function cacheKey(cachePath) {
  return cachePath || '__memory__';
}

function readCache(cachePath) {
  const key = cacheKey(cachePath);
  const memory = memoryCaches.get(key);
  if (memory) return memory;
  if (!cachePath) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* 文件不存在或损坏，返回空缓存 */ }
  return null;
}

function writeCache(cachePath, value) {
  const key = cacheKey(cachePath);
  memoryCaches.set(key, value);
  if (!cachePath) return;
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const tmp = `${cachePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value), 'utf8');
    fs.renameSync(tmp, cachePath);
  } catch { /* 缓存写不进去不影响检查结果 */ }
}

function readHeader(response, name) {
  const headers = response && response.headers;
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] || headers[name.toLowerCase()] || null;
}

function buildResult(release, {
  currentVersion,
  platform,
  arch,
  checkedAt,
  reason = null,
  retryAt = null,
} = {}) {
  const latestVersion = release ? release.version : null;
  const asset = release ? chooseAsset(release, platform, arch) : null;
  return {
    ok: Boolean(release),
    enabled: true,
    currentVersion,
    latestVersion,
    updateAvailable: Boolean(latestVersion) && isNewerVersion(latestVersion, currentVersion),
    releaseUrl: release ? release.releaseUrl : RELEASES_PAGE,
    publishedAt: release ? release.publishedAt : null,
    asset: asset ? {
      name: asset.name,
      size: asset.size,
      digest: asset.digest,
      downloadUrl: asset.downloadUrl,
    } : null,
    checkedAt: checkedAt || Date.now(),
    reason,
    retryAt,
  };
}

/**
 * 查询 GitHub 最新 Release。
 * 任何网络/限流/解析异常都返回 ok:false，不抛错，避免影响主服务。
 */
async function checkForUpdates(options = {}) {
  const currentVersion = options.currentVersion || APP_VERSION;
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const cachePath = options.cachePath === undefined ? defaultCachePath() : options.cachePath;
  const now = options.now || Date.now;
  const ttlMs = options.ttlMs || CACHE_TTL_MS;
  const fetchImpl = options.fetchImpl || fetch;
  const nowMs = now();

  const cached = readCache(cachePath);
  if (cached && cached.blockedUntil && nowMs < cached.blockedUntil) {
    return buildResult(cached.release || null, {
      currentVersion, platform, arch,
      checkedAt: cached.checkedAt || nowMs,
      reason: 'rate_limited',
      retryAt: cached.blockedUntil,
    });
  }

  if (!options.force && cached && cached.release && nowMs - (cached.checkedAt || 0) < ttlMs) {
    return buildResult(cached.release, {
      currentVersion, platform, arch,
      checkedAt: cached.checkedAt || nowMs,
    });
  }

  const key = cacheKey(cachePath);
  if (inflightChecks.has(key)) return inflightChecks.get(key);

  const task = (async () => {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': `view-tool/${currentVersion}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (cached && cached.etag) headers['If-None-Match'] = cached.etag;

    let response;
    try {
      const signal = typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
        : undefined;
      response = await fetchImpl(LATEST_RELEASE_URL, { headers, signal });
    } catch {
      return buildResult(cached ? cached.release : null, {
        currentVersion, platform, arch,
        checkedAt: cached ? cached.checkedAt : nowMs,
        reason: 'network_error',
      });
    }

    if (response.status === 304 && cached && cached.release) {
      const next = { ...cached, checkedAt: now() };
      writeCache(cachePath, next);
      return buildResult(next.release, {
        currentVersion, platform, arch,
        checkedAt: next.checkedAt,
      });
    }

    if (response.status === 403 || response.status === 429) {
      const resetSeconds = Number(readHeader(response, 'x-ratelimit-reset') || 0);
      const retryAt = resetSeconds > 0 && resetSeconds * 1000 > now()
        ? resetSeconds * 1000
        : now() + RATE_LIMIT_FALLBACK_MS;
      const next = {
        ...(cached || {}),
        checkedAt: cached ? cached.checkedAt : now(),
        blockedUntil: retryAt,
      };
      writeCache(cachePath, next);
      return buildResult(cached ? cached.release : null, {
        currentVersion, platform, arch,
        checkedAt: next.checkedAt,
        reason: 'rate_limited',
        retryAt,
      });
    }

    if (!response.ok) {
      return buildResult(cached ? cached.release : null, {
        currentVersion, platform, arch,
        checkedAt: cached ? cached.checkedAt : now(),
        reason: `http_${response.status}`,
      });
    }

    let raw;
    try {
      raw = await response.json();
    } catch {
      return buildResult(cached ? cached.release : null, {
        currentVersion, platform, arch,
        checkedAt: cached ? cached.checkedAt : now(),
        reason: 'invalid_json',
      });
    }

    const release = summarizeRelease(raw);
    if (!release) {
      return buildResult(cached ? cached.release : null, {
        currentVersion, platform, arch,
        checkedAt: cached ? cached.checkedAt : now(),
        reason: 'invalid_release',
      });
    }

    const next = {
      checkedAt: now(),
      etag: readHeader(response, 'etag') || null,
      release,
    };
    writeCache(cachePath, next);
    return buildResult(release, {
      currentVersion, platform, arch,
      checkedAt: next.checkedAt,
    });
  })();

  inflightChecks.set(key, task);
  try {
    return await task;
  } finally {
    inflightChecks.delete(key);
  }
}

module.exports = {
  REPO,
  RELEASES_PAGE,
  LATEST_RELEASE_URL,
  CACHE_TTL_MS,
  parseVersion,
  normalizeVersion,
  compareVersions,
  isNewerVersion,
  platformTarget,
  chooseAsset,
  summarizeRelease,
  checkForUpdates,
};
