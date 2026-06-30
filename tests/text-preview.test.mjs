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
