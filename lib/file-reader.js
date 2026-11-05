'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { safeResolve } = require('./path-guard');
const { AppError, Codes } = require('./errors');

const MIME = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.cjs': 'application/javascript',
  '.jsx': 'text/jsx',
  '.ts': 'application/typescript',
  '.mts': 'application/typescript',
  '.cts': 'application/typescript',
  '.tsx': 'text/tsx',
  '.py': 'text/x-python',
  '.sh': 'text/x-shellscript',
  '.bash': 'text/x-shellscript',
  '.zsh': 'text/x-shellscript',
  '.ps1': 'text/x-powershell',
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.toml': 'text/toml',
  '.ini': 'text/plain',
  '.env': 'text/plain',
  '.properties': 'text/plain',
  '.conf': 'text/plain',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.docm': 'application/vnd.ms-word.document.macroenabled.12',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroenabled.12',
  '.xls': 'application/vnd.ms-excel',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  // 编程语言：仅用于 /api/raw 的 Content-Type，预览本身按文本处理
  '.java': 'text/x-java-source',
  '.c': 'text/x-c',
  '.h': 'text/x-c',
  '.cc': 'text/x-c++',
  '.cpp': 'text/x-c++',
  '.cxx': 'text/x-c++',
  '.hpp': 'text/x-c++',
  '.cs': 'text/x-csharp',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.rb': 'text/x-ruby',
  '.php': 'text/x-php',
  '.sql': 'text/x-sql',
  '.kt': 'text/x-kotlin',
  '.swift': 'text/x-swift',
  '.lua': 'text/x-lua',
  '.pl': 'text/x-perl',
  '.r': 'text/x-r',
  '.vb': 'text/x-vb',
  '.scss': 'text/x-scss',
  '.less': 'text/x-less',
  '.bat': 'text/plain',
  '.cmd': 'text/plain',
  '.dockerfile': 'text/plain',
  '.diff': 'text/x-diff',
  '.patch': 'text/x-diff',
};

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

// OOXML / 老 Excel 格式交给浏览器端解析；pptx 暂不支持
const OFFICE_TYPES = {
  '.docx': 'docx',
  '.docm': 'docx',
  '.xlsx': 'xlsx',
  '.xlsm': 'xlsx',
  '.xls': 'xlsx',
};

const TEXT_EXTS = new Set([
  '.md', '.markdown', '.json', '.jsonc', '.json5', '.geojson', '.ipynb', '.webmanifest',
  '.html', '.htm', '.xml', '.xsl', '.xslt', '.css',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx',
  '.py', '.pyw', '.pyi', '.sh', '.bash', '.zsh', '.ksh', '.ps1', '.psm1', '.psd1',
  '.yml', '.yaml', '.toml', '.ini', '.cfg', '.env', '.properties', '.conf',
  '.csv', '.txt', '.log',
  '.scss', '.sass', '.less',
  '.java', '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx', '.ino',
  '.cs', '.go', '.rs', '.rb', '.php', '.phtml', '.sql', '.kt', '.kts', '.swift',
  '.lua', '.pl', '.pm', '.r', '.m', '.mm', '.vb', '.mk', '.diff', '.patch',
  '.graphql', '.gql', '.dockerfile',
  '.bat', '.cmd',
  '.dart', '.scala', '.sc', '.ex', '.exs', '.hs', '.lhs',
  '.clj', '.cljs', '.cljc', '.edn', '.jl', '.proto', '.cmake',
  '.groovy', '.gradle', '.asm', '.nasm', '.vue', '.svelte',
  // 无扩展名的常见文本文件（fileExt 会回退到 basename 比对）
  'dockerfile', 'makefile', 'gnumakefile', 'cmakelists.txt',
  'gemfile', 'rakefile', 'vagrantfile', 'jenkinsfile',
]);

function classify(ext) {
  if (OFFICE_TYPES[ext]) return OFFICE_TYPES[ext];
  if (TEXT_EXTS.has(ext)) return 'text';
  if (ext === '.pdf') return 'pdf';
  if (IMAGE_EXTS.has(ext)) return 'image';
  return 'binary';
}

function fileExt(target) {
  const ext = path.extname(target).toLowerCase();
  if (ext) return ext;
  const base = path.basename(target).toLowerCase();
  return TEXT_EXTS.has(base) ? base : '';
}

function readFileMeta(rootDir, requested, options = {}) {
  const maxPreviewSize = options.maxPreviewSize || 5242880;
  const maxOfficePreviewSize = options.maxOfficePreviewSize || 20971520;
  const target = safeResolve(rootDir, requested);

  let stat;
  try {
    stat = fs.statSync(target);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new AppError(Codes.NOT_FOUND, '文件不存在', 404);
    }
    if (err.code === 'EACCES') {
      throw new AppError(Codes.EACCES, '无权限读取此文件', 403);
    }
    throw new AppError(Codes.READ_FAILED, err.message, 500);
  }

  if (stat.isDirectory()) {
    throw new AppError(Codes.IS_DIRECTORY, '这是一个目录，请通过左侧树浏览', 400);
  }

  const ext = fileExt(target);
  const mime = MIME[ext] || 'application/octet-stream';
  const type = classify(ext);
  const isOffice = type === 'docx' || type === 'xlsx';
  const sizeLimit = isOffice ? maxOfficePreviewSize : maxPreviewSize;

  const base = {
    name: path.basename(target),
    path: path.relative(rootDir, target).split(path.sep).join('/'),
    type,
    mime,
    size: stat.size,
  };

  if (stat.size > sizeLimit) {
    return {
      ...base,
      type: 'binary-too-large',
      previewable: false,
      downloadUrl: `/api/raw?path=${encodeURIComponent(base.path)}`,
      message: isOffice
        ? `Office 文件超过 ${Math.round(sizeLimit / 1024 / 1024)} MB 预览限制，请下载`
        : '文件超过预览限制，请下载',
    };
  }

  if (type === 'text') {
    let content;
    try {
      content = fs.readFileSync(target, 'utf8');
    } catch (err) {
      throw new AppError(Codes.READ_FAILED, err.message, 500);
    }
    return { ...base, content };
  }

  if (type === 'image' || type === 'pdf') {
    return {
      ...base,
      downloadUrl: `/api/raw?path=${encodeURIComponent(base.path)}`,
    };
  }

  if (isOffice) {
    return {
      ...base,
      previewable: true,
      downloadUrl: `/api/raw?path=${encodeURIComponent(base.path)}`,
    };
  }

  return {
    ...base,
    type: 'binary',
    previewable: false,
    downloadUrl: `/api/raw?path=${encodeURIComponent(base.path)}`,
    message: '暂不支持预览，请下载',
  };
}

function streamFile(rootDir, requested) {
  const target = safeResolve(rootDir, requested);
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    throw new AppError(Codes.IS_DIRECTORY, '这是一个目录', 400);
  }
  return {
    stream: fs.createReadStream(target),
    size: stat.size,
    ext: path.extname(target).toLowerCase(),
  };
}

module.exports = {
  readFileMeta,
  streamFile,
  MIME,
  TEXT_EXTS,
  OFFICE_TYPES,
  classify,
};
