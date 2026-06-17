'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { readFileMeta } = require('../lib/file-reader');
const { AppError, Codes } = require('../lib/errors');

function makeFiles() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frtest-'));
  fs.writeFileSync(path.join(root, 'a.md'), '# title\n', 'utf8');
  fs.writeFileSync(path.join(root, 'a.json'), '{"k":1}', 'utf8');
  fs.writeFileSync(path.join(root, 'a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(root, 'a.pdf'), Buffer.from('%PDF-1.4'));
  fs.writeFileSync(path.join(root, 'a.pptx'), Buffer.from('pptx-mock'));
  fs.mkdirSync(path.join(root, 'sub'));
  return root;
}

test('readFileMeta 文本文件返回 type=text + content', () => {
  const root = makeFiles();
  try {
    const meta = readFileMeta(root, 'a.md', { maxPreviewSize: 5242880 });
    assert.strictEqual(meta.type, 'text');
    assert.ok(meta.content.includes('title'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('readFileMeta PNG 返回 type=image + downloadUrl', () => {
  const root = makeFiles();
  try {
    const meta = readFileMeta(root, 'a.png', { maxPreviewSize: 5242880 });
    assert.strictEqual(meta.type, 'image');
    assert.strictEqual(meta.mime, 'image/png');
    assert.ok(meta.downloadUrl.includes('/api/raw'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('readFileMeta PDF 返回 type=pdf + downloadUrl', () => {
  const root = makeFiles();
  try {
    const meta = readFileMeta(root, 'a.pdf', { maxPreviewSize: 5242880 });
    assert.strictEqual(meta.type, 'pdf');
    assert.strictEqual(meta.mime, 'application/pdf');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('readFileMeta PPTX 返回 type=binary + previewable=false', () => {
  const root = makeFiles();
  try {
    const meta = readFileMeta(root, 'a.pptx', { maxPreviewSize: 5242880 });
    assert.strictEqual(meta.type, 'binary');
    assert.strictEqual(meta.previewable, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('readFileMeta 超过 maxPreviewSize 的文件返回 type=binary-too-large', () => {
  const root = makeFiles();
  try {
    const meta = readFileMeta(root, 'a.md', { maxPreviewSize: 2 });
    assert.strictEqual(meta.type, 'binary-too-large');
    assert.ok(meta.downloadUrl);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('readFileMeta 目录返回错误 IS_DIRECTORY', () => {
  const root = makeFiles();
  try {
    assert.throws(() => readFileMeta(root, 'sub', { maxPreviewSize: 5242880 }), (err) => {
      return err instanceof AppError && err.code === Codes.IS_DIRECTORY;
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('readFileMeta 不存在的文件返回 NOT_FOUND', () => {
  const root = makeFiles();
  try {
    assert.throws(() => readFileMeta(root, 'nope.txt', { maxPreviewSize: 5242880 }), (err) => {
      return err instanceof AppError && err.code === Codes.NOT_FOUND;
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('readFileMeta MIME 推断覆盖常见类型', () => {
  const root = makeFiles();
  try {
    const cases = [
      ['a.md', 'text/markdown'],
      ['a.json', 'application/json'],
      ['a.png', 'image/png'],
      ['a.pdf', 'application/pdf'],
    ];
    for (const [name, expected] of cases) {
      const meta = readFileMeta(root, name, { maxPreviewSize: 5242880 });
      assert.strictEqual(meta.mime, expected, `MIME for ${name}`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
