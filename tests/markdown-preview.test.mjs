import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractMarkdownFrontMatter,
  renderMarkdownPreviewHtml,
} from '../public/markdown-preview.mjs';

test('extractMarkdownFrontMatter splits a closed leading YAML block', () => {
  const raw = '---\nname: pptx-craft\ndescription: "Use when demo"\n---\n\n# Body\n';

  assert.deepEqual(extractMarkdownFrontMatter(raw), {
    frontMatter: '---\nname: pptx-craft\ndescription: "Use when demo"\n---',
    body: '\n# Body\n',
  });
});

test('extractMarkdownFrontMatter leaves ordinary markdown unchanged', () => {
  const raw = '---\n\n# Body\n';

  assert.deepEqual(extractMarkdownFrontMatter(raw), {
    frontMatter: '',
    body: raw,
  });
});

test('renderMarkdownPreviewHtml preserves front matter line breaks before parsing body', () => {
  const raw = '---\nname: pptx-craft\ndescription: "Use when demo"\n---\n\n# Body\n';
  const html = renderMarkdownPreviewHtml(raw, (markdown) => `<p>${markdown.trim()}</p>`);

  assert.match(
    html,
    /^<pre class="markdown-frontmatter">---\nname: pptx-craft\ndescription: &quot;Use when demo&quot;\n---<\/pre>\n<p># Body<\/p>$/,
  );
});
