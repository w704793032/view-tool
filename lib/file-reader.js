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
  '.ts': 'application/typescript',
  '.py': 'text/x-python',
  '.sh': 'text/x-shellscript',
  '.ps1': 'text/x-powershell',
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
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
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
};

const PREVIEWABLE_BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf']);

const TEXT_EXTS = new Set([
  '.md', '.markdown', '.json', '.html', '.htm', '.xml', '.css',
  '.js', '.mjs', '.ts', '.py', '.sh', '.ps1', '.yml', '.yaml',
  '.csv', '.txt', '.log',
]);

function classify(ext) {
  if (TEXT_EXTS.has(ext)) return 'text';
  if (ext === '.pdf') return 'pdf';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return 'image';
  return 'binary';
}

function readFileMeta(rootDir, requested, options = {}) {
  const maxPreviewSize = options.maxPreviewSize || 5242880;
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

  const ext = path.extname(target).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const type = classify(ext);

  const base = {
    name: path.basename(target),
    path: path.relative(rootDir, target).split(path.sep).join('/'),
    type,
    mime,
    size: stat.size,
  };

  if (stat.size > maxPreviewSize) {
    return {
      ...base,
      type: 'binary-too-large',
      downloadUrl: `/api/raw?path=${encodeURIComponent(base.path)}`,
      message: '文件超过预览限制，请下载',
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

module.exports = { readFileMeta, streamFile, MIME, classify };
