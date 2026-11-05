const PREVIEW_BY_EXT = new Map([
  // 脚本 / 应用
  ['py', ['python', 'Python']],
  ['pyw', ['python', 'Python']],
  ['pyi', ['python', 'Python']],
  ['js', ['javascript', 'JavaScript']],
  ['mjs', ['javascript', 'JavaScript']],
  ['cjs', ['javascript', 'JavaScript']],
  ['jsx', ['javascript', 'JavaScript JSX']],
  ['ts', ['typescript', 'TypeScript']],
  ['mts', ['typescript', 'TypeScript']],
  ['cts', ['typescript', 'TypeScript']],
  ['tsx', ['typescript', 'TypeScript TSX']],
  ['java', ['java', 'Java']],
  ['kt', ['kotlin', 'Kotlin']],
  ['kts', ['kotlin', 'Kotlin']],
  ['scala', ['scala', 'Scala']],
  ['sc', ['scala', 'Scala']],
  ['groovy', ['groovy', 'Groovy']],
  ['gradle', ['groovy', 'Gradle']],
  ['go', ['go', 'Go']],
  ['rs', ['rust', 'Rust']],
  ['rb', ['ruby', 'Ruby']],
  ['php', ['php', 'PHP']],
  ['phtml', ['php-template', 'PHP Template']],
  ['cs', ['csharp', 'C#']],
  ['vb', ['vbnet', 'VB.NET']],
  ['swift', ['swift', 'Swift']],
  ['dart', ['dart', 'Dart']],
  ['lua', ['lua', 'Lua']],
  ['pl', ['perl', 'Perl']],
  ['pm', ['perl', 'Perl']],
  ['r', ['r', 'R']],
  ['ex', ['elixir', 'Elixir']],
  ['exs', ['elixir', 'Elixir']],
  ['hs', ['haskell', 'Haskell']],
  ['lhs', ['haskell', 'Haskell']],
  ['clj', ['clojure', 'Clojure']],
  ['cljs', ['clojure', 'ClojureScript']],
  ['cljc', ['clojure', 'Clojure']],
  ['edn', ['clojure', 'EDN']],
  ['jl', ['julia', 'Julia']],
  ['m', ['objectivec', 'Objective-C']],
  ['mm', ['objectivec', 'Objective-C++']],
  ['c', ['c', 'C']],
  ['h', ['cpp', 'C/C++ Header']],
  ['cc', ['cpp', 'C++']],
  ['cpp', ['cpp', 'C++']],
  ['cxx', ['cpp', 'C++']],
  ['hpp', ['cpp', 'C++ Header']],
  ['hh', ['cpp', 'C++ Header']],
  ['hxx', ['cpp', 'C++ Header']],
  ['ino', ['cpp', 'Arduino']],
  ['asm', ['x86asm', 'Assembly']],
  ['nasm', ['x86asm', 'Assembly']],
  ['sql', ['sql', 'SQL']],
  ['graphql', ['graphql', 'GraphQL']],
  ['gql', ['graphql', 'GraphQL']],
  ['proto', ['protobuf', 'Protocol Buffers']],
  ['ps1', ['powershell', 'PowerShell']],
  ['psm1', ['powershell', 'PowerShell Module']],
  ['psd1', ['powershell', 'PowerShell Data']],
  ['dockerfile', ['dockerfile', 'Dockerfile']],
  ['bat', ['dos', 'Batch']],
  ['cmd', ['dos', 'Batch']],
  // 标记 / 配置
  ['md', ['markdown', 'Markdown']],
  ['markdown', ['markdown', 'Markdown']],
  ['html', ['xml', 'HTML']],
  ['htm', ['xml', 'HTML']],
  ['xml', ['xml', 'XML']],
  ['xsl', ['xml', 'XSLT']],
  ['xslt', ['xml', 'XSLT']],
  ['vue', ['xml', 'Vue']],
  ['svelte', ['xml', 'Svelte']],
  ['css', ['css', 'CSS']],
  ['scss', ['scss', 'SCSS']],
  ['sass', ['scss', 'Sass']],
  ['less', ['less', 'Less']],
  ['json', ['json', 'JSON']],
  ['jsonc', ['json', 'JSON with Comments']],
  ['json5', ['json', 'JSON5']],
  ['geojson', ['json', 'GeoJSON']],
  ['ipynb', ['json', 'Jupyter Notebook']],
  ['webmanifest', ['json', 'Web Manifest']],
  ['yml', ['yaml', 'YAML']],
  ['yaml', ['yaml', 'YAML']],
  ['toml', ['ini', 'TOML']],
  ['ini', ['ini', 'INI']],
  ['cfg', ['ini', 'Config']],
  ['env', ['ini', 'Environment']],
  ['properties', ['ini', 'Properties']],
  ['conf', ['ini', 'Config']],
  ['sh', ['shell', 'Shell']],
  ['bash', ['shell', 'Shell']],
  ['zsh', ['shell', 'Shell']],
  ['ksh', ['shell', 'Shell']],
  ['mk', ['makefile', 'Makefile']],
  ['diff', ['diff', 'Diff']],
  ['patch', ['diff', 'Patch']],
  ['cmake', ['cmake', 'CMake']],
  // 纯文本
  ['csv', ['plaintext', 'CSV']],
  ['txt', ['plaintext', 'Text']],
  ['log', ['plaintext', 'Log']],
]);

// 无扩展名 / 命名固定的文件
const PREVIEW_BY_NAME = new Map([
  ['dockerfile', ['dockerfile', 'Dockerfile']],
  ['makefile', ['makefile', 'Makefile']],
  ['gnumakefile', ['makefile', 'Makefile']],
  ['cmakelists.txt', ['cmake', 'CMake']],
  ['gemfile', ['ruby', 'Ruby']],
  ['rakefile', ['ruby', 'Ruby']],
  ['vagrantfile', ['ruby', 'Ruby']],
  ['jenkinsfile', ['groovy', 'Jenkinsfile']],
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
  const name = fileNameFromPath(filePath).toLowerCase();
  const byName = PREVIEW_BY_NAME.get(name);
  if (byName) return { kind: 'code', language: byName[0], label: byName[1] };
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

export { PREVIEW_BY_EXT, PREVIEW_BY_NAME };
