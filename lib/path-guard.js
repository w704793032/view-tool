'use strict';

const path = require('node:path');
const { AppError, Codes } = require('./errors');

function reject(reason) {
  throw new AppError(Codes.PATH_ESCAPE, `禁止访问该路径（${reason}）`, 403);
}

function isWithinRoot(rootDir, target) {
  const root = path.resolve(rootDir);
  const tgt = path.resolve(target);
  if (tgt === root) return true;
  const rel = path.relative(root, tgt);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return true;
}

function safeResolve(rootDir, requested) {
  if (typeof requested !== 'string') reject('请求路径不是字符串');
  if (requested.length === 0) reject('空路径');
  if (requested.includes('\0')) reject('包含 null 字节');

  const root = path.resolve(rootDir);

  if (path.isAbsolute(requested)) {
    if (!isWithinRoot(root, requested)) reject('绝对路径越权');
    return path.resolve(requested);
  }

  const target = path.resolve(root, requested);
  if (!isWithinRoot(root, target)) reject('相对路径越权');
  return target;
}

module.exports = { safeResolve, isWithinRoot };
