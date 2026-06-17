'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { ConfigStore } = require('../lib/config-store');

function tmpConfigPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cstest-')), 'config.json');
}

test('load 缺失文件时返回默认值', () => {
  const p = tmpConfigPath();
  const store = new ConfigStore(p, { rootDir: 'D:\\x' });
  const cfg = store.load();
  assert.strictEqual(cfg.rootDir, 'D:\\x');
  assert.strictEqual(cfg.port, 3000);
});

test('load 已存在文件时读取并合并', () => {
  const p = tmpConfigPath();
  fs.writeFileSync(p, JSON.stringify({ rootDir: 'D:\\y', port: 4000 }));
  const store = new ConfigStore(p, { rootDir: 'D:\\default' });
  const cfg = store.load();
  assert.strictEqual(cfg.rootDir, 'D:\\default');
  assert.strictEqual(cfg.port, 4000);
});

test('load 损坏 JSON 时返回默认值', () => {
  const p = tmpConfigPath();
  fs.writeFileSync(p, '{ not valid json');
  const store = new ConfigStore(p, { rootDir: 'D:\\z' });
  const cfg = store.load();
  assert.strictEqual(cfg.rootDir, 'D:\\z');
});

test('save 写入并可被重新 load', () => {
  const p = tmpConfigPath();
  const store = new ConfigStore(p, { rootDir: 'D:\\a' });
  store.save({ rootDir: 'D:\\b', port: 5000, maxPreviewSize: 1024, version: 1 });
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.strictEqual(data.rootDir, 'D:\\b');
  assert.strictEqual(data.port, 5000);
});

test('save 原子写入：临时文件不留存', () => {
  const p = tmpConfigPath();
  const store = new ConfigStore(p, { rootDir: 'D:\\a' });
  store.save({ rootDir: 'D:\\c', port: 3000, maxPreviewSize: 1024, version: 1 });
  const dir = path.dirname(p);
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp'));
  assert.strictEqual(leftovers.length, 0);
});

test('save 写入不存在的目录时自动创建', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cstest-'));
  const p = path.join(base, 'sub', 'config.json');
  const store = new ConfigStore(p, { rootDir: 'D:\\a' });
  store.save({ rootDir: 'D:\\d', port: 3000, maxPreviewSize: 1024, version: 1 });
  assert.ok(fs.existsSync(p));
});
