'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { buildTree } = require('../lib/tree-builder');

function makeTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tbtest-'));
  fs.writeFileSync(path.join(root, 'a.txt'), 'a');
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, 'sub', 'b.txt'), 'b');
  fs.writeFileSync(path.join(root, '.hidden'), 'h');
  return root;
}

test('buildTree 返回一层 entries', () => {
  const root = makeTree();
  try {
    const result = buildTree(root, '.', { showHidden: false });
    const names = result.entries.map((e) => e.name).sort();
    assert.deepStrictEqual(names, ['a.txt', 'sub']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('buildTree 标记 type=dir / type=file', () => {
  const root = makeTree();
  try {
    const result = buildTree(root, '.', { showHidden: false });
    const sub = result.entries.find((e) => e.name === 'sub');
    const file = result.entries.find((e) => e.name === 'a.txt');
    assert.strictEqual(sub.type, 'dir');
    assert.strictEqual(file.type, 'file');
    assert.strictEqual(typeof file.size, 'number');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('buildTree 默认不显示隐藏文件', () => {
  const root = makeTree();
  try {
    const result = buildTree(root, '.', { showHidden: false });
    const names = result.entries.map((e) => e.name);
    assert.ok(!names.includes('.hidden'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('buildTree showHidden=true 时显示隐藏文件', () => {
  const root = makeTree();
  try {
    const result = buildTree(root, '.', { showHidden: true });
    const names = result.entries.map((e) => e.name);
    assert.ok(names.includes('.hidden'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('buildTree 空目录返回空 entries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tbtest-'));
  try {
    const result = buildTree(root, '.', { showHidden: false });
    assert.deepStrictEqual(result.entries, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('buildTree 目录排在文件之前', () => {
  const root = makeTree();
  try {
    const result = buildTree(root, '.', { showHidden: false });
    const types = result.entries.map((e) => e.type);
    const firstFile = types.indexOf('file');
    const lastDir = types.lastIndexOf('dir');
    if (firstFile !== -1 && lastDir !== -1) {
      assert.ok(lastDir < firstFile, '所有 dir 应当排在所有 file 之前');
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
