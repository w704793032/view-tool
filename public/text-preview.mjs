const PREVIEW_BY_EXT = new Map([
  ['py', ['python', 'Python']],
  ['js', ['javascript', 'JavaScript']],
  ['mjs', ['javascript', 'JavaScript']],
  ['cjs', ['javascript', 'JavaScript']],
  ['jsx', ['javascript', 'JavaScript JSX']],
  ['ts', ['typescript', 'TypeScript']],
  ['mts', ['typescript', 'TypeScript']],
  ['cts', ['typescript', 'TypeScript']],
  ['tsx', ['typescript', 'TypeScript TSX']],
  ['css', ['css', 'CSS']],
  ['scss', ['scss', 'SCSS']],
  ['html', ['xml', 'HTML']],
  ['htm', ['xml', 'HTML']],
  ['xml', ['xml', 'XML']],
  ['json', ['json', 'JSON']],
  ['yml', ['yaml', 'YAML']],
  ['yaml', ['yaml', 'YAML']],
  ['toml', ['ini', 'TOML']],
  ['ini', ['ini', 'INI']],
  ['env', ['ini', 'Environment']],
  ['properties', ['ini', 'Properties']],
  ['conf', ['ini', 'Config']],
  ['sh', ['shell', 'Shell']],
  ['bash', ['shell', 'Shell']],
  ['zsh', ['shell', 'Shell']],
  ['ps1', ['plaintext', 'PowerShell']],
  ['csv', ['plaintext', 'CSV']],
  ['txt', ['plaintext', 'Text']],
  ['log', ['plaintext', 'Log']],
]);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fileNameFromPath(filePath) {
  return String(filePath || '').split(/[\\/]/).pop() || 'text';
}

function extensionFromPath(filePath) {
  const name = fileNameFromPath(filePath).toLowerCase();
  if (name === '.env') return 'env';
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1);
}

export function getTextPreviewInfo(filePath) {
  const ext = extensionFromPath(filePath);
  const [language, label] = PREVIEW_BY_EXT.get(ext) || ['plaintext', 'Text'];
  return { kind: 'code', language, label };
}

export function renderCodePreviewHtml(filePath, content) {
  const info = getTextPreviewInfo(filePath);
  const language = escapeHtml(info.language);
  return [
    `<div class="code-preview" data-language="${language}">`,
    '  <div class="code-preview-toolbar">',
    `    <span class="code-preview-label">${escapeHtml(info.label)}</span>`,
    `    <span class="code-preview-path">${escapeHtml(fileNameFromPath(filePath))}</span>`,
    '  </div>',
    `  <pre class="code-preview-block"><code class="language-${language}">${escapeHtml(content ?? '')}</code></pre>`,
    '</div>',
  ].join('\n');
}
