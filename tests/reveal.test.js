'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { buildRevealCommand } = require('../lib/reveal');

/** 临时把 process.platform 改成 p 来跑 fn，跑完恢复。 */
function withPlatform(p, fn) {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
  try { return fn(); } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  }
}

// --- win32 (仅在 win32 上跑，避免非 win32 主机上报错) ---
test('buildRevealCommand: file 在 win32 上返回 explorer.exe + /select,<path>', {
  skip: process.platform !== 'win32',
}, () => {
  const result = buildRevealCommand('D:\\foo\\bar.txt', 'file');
  assert.strictEqual(result.cmd, 'explorer.exe');
  assert.deepStrictEqual(result.args, ['/select,D:\\foo\\bar.txt']);
});

test('buildRevealCommand: dir 在 win32 上返回 explorer.exe + <path>', {
  skip: process.platform !== 'win32',
}, () => {
  const result = buildRevealCommand('D:\\foo', 'dir');
  assert.strictEqual(result.cmd, 'explorer.exe');
  assert.deepStrictEqual(result.args, ['D:\\foo']);
});

test('buildRevealCommand: 特殊字符（空格 & 中文 & 括号）原样透传，不做 shell 转义', {
  skip: process.platform !== 'win32',
}, () => {
  const weird = 'D:\\我的 文件 & 1 (copy).txt';
  const result = buildRevealCommand(weird, 'file');
  assert.deepStrictEqual(result.args, [`/select,${weird}`]);
});

// --- darwin（用注入方式跨平台可跑）---
test('buildRevealCommand: darwin 上 file 返回 open -R <path>', () => {
  withPlatform('darwin', () => {
    const result = buildRevealCommand('/Users/me/foo/bar.txt', 'file');
    assert.strictEqual(result.cmd, 'open');
    assert.deepStrictEqual(result.args, ['-R', '/Users/me/foo/bar.txt']);
  });
});

test('buildRevealCommand: darwin 上 dir 返回 open <path>', () => {
  withPlatform('darwin', () => {
    const result = buildRevealCommand('/Users/me/foo', 'dir');
    assert.strictEqual(result.cmd, 'open');
    assert.deepStrictEqual(result.args, ['/Users/me/foo']);
  });
});

// --- linux（无跨桌面"选中文件"标准，回退打开父目录）---
test('buildRevealCommand: linux 上 file 回退到 xdg-open 父目录', () => {
  withPlatform('linux', () => {
    const result = buildRevealCommand('/home/me/foo/bar.txt', 'file');
    assert.strictEqual(result.cmd, 'xdg-open');
    assert.deepStrictEqual(result.args, ['/home/me/foo']);
  });
});

test('buildRevealCommand: linux 上 dir 返回 xdg-open <path>', () => {
  withPlatform('linux', () => {
    const result = buildRevealCommand('/home/me/foo', 'dir');
    assert.strictEqual(result.cmd, 'xdg-open');
    assert.deepStrictEqual(result.args, ['/home/me/foo']);
  });
});

// --- 通用异常分支 ---
test('buildRevealCommand: 未知 kind 抛 AppError(READ_FAILED, status 500)', () => {
  assert.throws(
    () => buildRevealCommand('/foo', 'symlink'),
    (err) => err.code === 'READ_FAILED' && err.status === 500
  );
});

test('buildRevealCommand: 真正不支持的平台（aix）抛 AppError(UNSUPPORTED_PLATFORM, status 501)', () => {
  withPlatform('aix', () => {
    assert.throws(
      () => buildRevealCommand('/foo/bar.txt', 'file'),
      (err) => err.code === 'UNSUPPORTED_PLATFORM' && err.status === 501
    );
  });
});
