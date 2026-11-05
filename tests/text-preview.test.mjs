import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getTextPreviewInfo,
  renderCodePreviewHtml,
} from '../public/text-preview.mjs';

test('getTextPreviewInfo maps common source files to highlight languages', () => {
  assert.deepEqual(getTextPreviewInfo('src/main.py'), {
    kind: 'code',
    language: 'python',
    label: 'Python',
  });
  assert.deepEqual(getTextPreviewInfo('src/app.ts'), {
    kind: 'code',
    language: 'typescript',
    label: 'TypeScript',
  });
  assert.deepEqual(getTextPreviewInfo('src/app.mjs'), {
    kind: 'code',
    language: 'javascript',
    label: 'JavaScript',
  });
});

test('getTextPreviewInfo covers common compiled / backend languages', () => {
  const cases = [
    ['Main.java', 'java', 'Java'],
    ['main.c', 'c', 'C'],
    ['main.cpp', 'cpp', 'C++'],
    ['Program.cs', 'csharp', 'C#'],
    ['main.go', 'go', 'Go'],
    ['lib.rs', 'rust', 'Rust'],
    ['app.rb', 'ruby', 'Ruby'],
    ['index.php', 'php', 'PHP'],
    ['query.sql', 'sql', 'SQL'],
    ['Main.kt', 'kotlin', 'Kotlin'],
    ['main.swift', 'swift', 'Swift'],
    ['init.lua', 'lua', 'Lua'],
  ];
  for (const [file, language, label] of cases) {
    assert.deepEqual(getTextPreviewInfo(file), { kind: 'code', language, label }, file);
  }
});

test('getTextPreviewInfo supports lazily loaded grammars and basename files', () => {
  assert.strictEqual(getTextPreviewInfo('deploy.ps1').language, 'powershell');
  assert.strictEqual(getTextPreviewInfo('Dockerfile').language, 'dockerfile');
  assert.strictEqual(getTextPreviewInfo('app.dockerfile').language, 'dockerfile');
  assert.strictEqual(getTextPreviewInfo('CMakeLists.txt').language, 'cmake');
  assert.strictEqual(getTextPreviewInfo('Jenkinsfile').language, 'groovy');
  assert.deepEqual(getTextPreviewInfo('notes.unknown'), {
    kind: 'code',
    language: 'plaintext',
    label: 'Text',
  });
});

test('getTextPreviewInfo maps yaml and toml to structured text preview languages', () => {
  assert.deepEqual(getTextPreviewInfo('config.yml'), {
    kind: 'code',
    language: 'yaml',
    label: 'YAML',
  });
  assert.deepEqual(getTextPreviewInfo('pyproject.toml'), {
    kind: 'code',
    language: 'ini',
    label: 'TOML',
  });
});

test('renderCodePreviewHtml escapes content and includes language metadata', () => {
  const html = renderCodePreviewHtml('app.ts', 'const tag = "<x>";');

  assert.match(html, /<div class="code-preview" data-language="typescript">/);
  assert.match(html, /<span class="code-preview-label">TypeScript<\/span>/);
  assert.match(html, /<code class="language-typescript">const tag = &quot;&lt;x&gt;&quot;;<\/code>/);
});
