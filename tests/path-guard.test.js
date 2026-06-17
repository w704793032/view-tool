'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { safeResolve, isWithinRoot } = require('../lib/path-guard');
const { AppError, Codes } = require('../lib/errors');

function makeTmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgtest-'));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'world');
  return dir;
}

test('safeResolve 接受 "." 解析为根', () => {
  const root = makeTmpRoot();
  try {
    const r = safeResolve(root, '.');
    assert.strictEqual(path.resolve(r), path.resolve(root));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('safeResolve 接受子路径', () => {
  const root = makeTmpRoot();
  try {
    const r = safeResolve(root, 'sub/b.txt');
    assert.strictEqual(path.basename(r), 'b.txt');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('safeResolve 拒绝 ".." 越权', () => {
  const root = makeTmpRoot();
  try {
    assert.throws(() => safeResolve(root, '..'), (err) => {
      return err instanceof AppError && err.code === Codes.PATH_ESCAPE;
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('safeResolve 拒绝多层 "..\\..\\.." 越权', () => {
  const root = makeTmpRoot();
  try {
    assert.throws(() => safeResolve(root, '../../etc/passwd'), (err) => {
      return err instanceof AppError && err.code === Codes.PATH_ESCAPE;
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('safeResolve 拒绝绝对路径注入', () => {
  const root = makeTmpRoot();
  try {
    assert.throws(() => safeResolve(root, 'C:\\Windows\\System32'), (err) => {
      return err instanceof AppError && err.code === Codes.PATH_ESCAPE;
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('safeResolve 拒绝 null 字节', () => {
  const root = makeTmpRoot();
  try {
    assert.throws(() => safeResolve(root, 'a.txt\0.bak'), (err) => {
      return err instanceof AppError && err.code === Codes.PATH_ESCAPE;
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('safeResolve 拒绝空字符串', () => {
  const root = makeTmpRoot();
  try {
    assert.throws(() => safeResolve(root, ''), (err) => {
      return err instanceof AppError && err.code === Codes.PATH_ESCAPE;
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('isWithinRoot 正确判定', () => {
  const root = makeTmpRoot();
  try {
    assert.strictEqual(isWithinRoot(root, path.join(root, 'a.txt')), true);
    assert.strictEqual(isWithinRoot(root, path.join(root, '..', 'x')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
