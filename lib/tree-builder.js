'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { safeResolve } = require('./path-guard');
const { AppError, Codes } = require('./errors');

function buildTree(rootDir, requested, options = {}) {
  const showHidden = options.showHidden === true;
  const target = safeResolve(rootDir, requested);

  let stat;
  try {
    stat = fs.statSync(target);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new AppError(Codes.NOT_FOUND, '路径不存在', 404);
    }
    if (err.code === 'EACCES') {
      throw new AppError(Codes.EACCES, '无权限访问', 403);
    }
    throw err;
  }

  if (!stat.isDirectory()) {
    throw new AppError(Codes.IS_DIRECTORY, '该路径不是目录', 400);
  }

  const dirents = fs.readdirSync(target, { withFileTypes: true });

  const entries = [];
  for (const d of dirents) {
    if (!showHidden && d.name.startsWith('.')) continue;
    if (d.isSymbolicLink()) continue;

    let size = null;
    if (d.isFile()) {
      try {
        size = fs.statSync(path.join(target, d.name)).size;
      } catch (_) {
        size = null;
      }
    }

    entries.push({
      name: d.name,
      type: d.isDirectory() ? 'dir' : 'file',
      size,
    });
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });

  return {
    current: path.relative(rootDir, target).split(path.sep).join('/') || '.',
    entries,
  };
}

module.exports = { buildTree };
