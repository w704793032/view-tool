function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripTrailingCarriageReturn(value) {
  return value.endsWith('\r') ? value.slice(0, -1) : value;
}

function looksLikeYamlFrontMatter(content) {
  return /^[A-Za-z0-9_-]+:\s*/m.test(content);
}

export function extractMarkdownFrontMatter(raw) {
  const text = String(raw ?? '');
  const start = text.startsWith('\uFEFF') ? 1 : 0;
  const firstLineEnd = text.indexOf('\n', start);
  if (firstLineEnd === -1) return { frontMatter: '', body: text };

  const firstLine = stripTrailingCarriageReturn(text.slice(start, firstLineEnd));
  if (firstLine.trim() !== '---') return { frontMatter: '', body: text };

  let lineStart = firstLineEnd + 1;
  while (lineStart < text.length) {
    const lineEnd = text.indexOf('\n', lineStart);
    const lineLimit = lineEnd === -1 ? text.length : lineEnd;
    const line = stripTrailingCarriageReturn(text.slice(lineStart, lineLimit));

    if (line.trim() === '---') {
      const content = text.slice(firstLineEnd + 1, lineStart);
      if (!looksLikeYamlFrontMatter(content)) {
        return { frontMatter: '', body: text };
      }
      const frontMatter = text.slice(start, lineStart + line.length);
      const body = lineEnd === -1 ? '' : text.slice(lineEnd + 1);
      return { frontMatter, body };
    }

    if (lineEnd === -1) break;
    lineStart = lineEnd + 1;
  }

  return { frontMatter: '', body: text };
}

export function renderMarkdownPreviewHtml(raw, parseMarkdown) {
  const { frontMatter, body } = extractMarkdownFrontMatter(raw);
  if (!frontMatter) return parseMarkdown(String(raw ?? ''));

  return [
    `<pre class="markdown-frontmatter">${escapeHtml(frontMatter)}</pre>`,
    parseMarkdown(body),
  ].join('\n');
}
