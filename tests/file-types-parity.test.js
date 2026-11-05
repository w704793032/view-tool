'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { TEXT_EXTS } = require('../lib/file-reader');

// 前后端各维护一份文本扩展名白名单：前端决定用什么语法高亮，服务端决定是否按文本读取。
// 两边一旦漂移，就会出现“前端认识 .java 但服务端仍返回 binary”的假预览。
test('前端语言映射的扩展名全部在服务端文本白名单中', async () => {
  const { PREVIEW_BY_EXT, PREVIEW_BY_NAME } = await import('../public/text-preview.mjs');
  const missing = [];

  for (const ext of PREVIEW_BY_EXT.keys()) {
    if (!TEXT_EXTS.has(`.${ext}`)) missing.push(`.${ext}`);
  }
  for (const name of PREVIEW_BY_NAME.keys()) {
    if (!TEXT_EXTS.has(name)) missing.push(name);
  }

  assert.deepEqual(missing, []);
});

test('服务端文本白名单里的语言扩展名都有前端映射', async () => {
  const { PREVIEW_BY_EXT } = await import('../public/text-preview.mjs');
  const mapped = new Set([...PREVIEW_BY_EXT.keys()].map((ext) => `.${ext}`));
  const knownTextFiles = [
    '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.rb', '.php', '.sql',
    '.kt', '.swift', '.lua', '.pl', '.r', '.ps1', '.bat', '.scss',
  ];
  const missing = knownTextFiles.filter((ext) => !TEXT_EXTS.has(ext) || !mapped.has(ext));
  assert.deepEqual(missing, []);
});
