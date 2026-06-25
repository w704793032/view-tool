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
