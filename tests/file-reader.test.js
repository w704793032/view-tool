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
  fs.writeFileSync(path.join(root, 'a.toml'), 'name = "view-tool"\n', 'utf8');
  fs.writeFileSync(path.join(root, '.env'), 'VIEW_TOOL=1\n', 'utf8');
  fs.writeFileSync(path.join(root, 'a.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(root, 'a.pdf'), Buffer.from('%PDF-1.4'));
  fs.writeFileSync(path.join(root, 'a.pptx'), Buffer.from('pptx-mock'));
  fs.writeFileSync(path.join(root, 'a.docx'), Buffer.from('docx-mock'));
  fs.writeFileSync(path.join(root, 'a.xlsx'), Buffer.from('xlsx-mock'));
  fs.writeFileSync(path.join(root, 'a.xls'), Buffer.from('xls-mock'));
  fs.writeFileSync(path.join(root, 'a.java'), 'public class A {}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'a.ps1'), 'Get-ChildItem\n', 'utf8');
  fs.writeFileSync(path.join(root, 'Dockerfile'), 'FROM node:22\n', 'utf8');
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

test('readFileMeta DOCX/XLSX/XLS 返回可预览 Office 类型 + downloadUrl', () => {
  const root = makeFiles();
  try {
    for (const [name, type] of [['a.docx', 'docx'], ['a.xlsx', 'xlsx'], ['a.xls', 'xlsx']]) {
      const meta = readFileMeta(root, name, { maxPreviewSize: 5242880 });
      assert.strictEqual(meta.type, type, name);
      assert.strictEqual(meta.previewable, true, name);
      assert.ok(meta.downloadUrl.includes('/api/raw'), name);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('readFileMeta Office 文件使用独立的 maxOfficePreviewSize', () => {
  const root = makeFiles();
  try {
    const meta = readFileMeta(root, 'a.docx', {
      maxPreviewSize: 5242880,
      maxOfficePreviewSize: 2,
    });
    assert.strictEqual(meta.type, 'binary-too-large');
    assert.match(meta.message, /Office/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('readFileMeta 常见编程语言按文本读取', () => {
  const root = makeFiles();
  try {
    for (const name of ['a.java', 'a.ps1', 'Dockerfile']) {
      const meta = readFileMeta(root, name, { maxPreviewSize: 5242880 });
      assert.strictEqual(meta.type, 'text', name);
      assert.ok(meta.content.length > 0, name);
    }
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
      ['a.toml', 'text/toml'],
      ['.env', 'text/plain'],
      ['a.png', 'image/png'],
      ['a.pdf', 'application/pdf'],
      ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['a.xls', 'application/vnd.ms-excel'],
      ['a.java', 'text/x-java-source'],
    ];
    for (const [name, expected] of cases) {
      const meta = readFileMeta(root, name, { maxPreviewSize: 5242880 });
      assert.strictEqual(meta.mime, expected, `MIME for ${name}`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
