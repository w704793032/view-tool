'use strict';

/**
 * 把 dist/view-tool[.exe] 打包成 zip 分发。
 *   - Windows 主机: 用 PowerShell Compress-Archive
 *   - macOS   主机: 用 ditto (保留可执行位)
 *
 * zip 里必须同时包含 view-tool.blob：SEA 版启动时靠它判断配置目录
 * (%APPDATA%\view-tool / ~/Library/Application Support/view-tool)，
 * 只发 exe 会让程序误判为源码模式。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const target = process.argv[2];
if (!['win', 'mac'].includes(target)) {
  console.error('用法: node scripts/zip-artifact.js <win|mac>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const isMac = target === 'mac';
const ext = isMac ? '' : '.exe';
const binName = `view-tool${ext}`;
const bin = path.join(root, 'dist', binName);
const blob = path.join(root, 'dist', 'view-tool.blob');

if (!fs.existsSync(bin)) {
  console.error(`[zip] 找不到二进制: ${bin}，请先运行 npm run build:${target}`);
  process.exit(1);
}
if (!fs.existsSync(blob)) {
  console.error(`[zip] 找不到 SEA blob: ${blob}，请先运行 npm run build:${target}`);
  process.exit(1);
}

const arch = process.arch; // 'x64' / 'arm64'
const hostTag = `${process.platform}-${arch}`;
const outName = `view-tool-${hostTag}-${target}.zip`;
const out = path.join(root, 'dist', outName);

if (fs.existsSync(out)) fs.unlinkSync(out);

// 统一先放进临时目录，保证 zip 根目录下只有 exe + blob（没有外层文件夹）
const stage = path.join(root, 'dist', `.stage-${target}-${process.pid}`);
fs.mkdirSync(stage, { recursive: true });
const stagedBin = path.join(stage, binName);
fs.copyFileSync(bin, stagedBin);
fs.chmodSync(stagedBin, 0o755);
fs.copyFileSync(blob, path.join(stage, 'view-tool.blob'));

let r;
try {
  if (process.platform === 'win32') {
    // Windows 主机 → 用 PowerShell Compress-Archive
    const pattern = path.join(stage, '*').replace(/'/g, "''");
    r = spawnSync('powershell', [
      '-NoProfile', '-Command',
      `Compress-Archive -Path '${pattern}' -DestinationPath '${out}' -Force`,
    ], { stdio: 'inherit' });
  } else if (process.platform === 'darwin') {
    // macOS 主机 → 用 ditto 保留可执行位 + 资源叉
    r = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', stage, out], { stdio: 'inherit' });
  } else {
    console.error(`[zip] 不支持的构建主机: ${process.platform}`);
    process.exit(1);
  }
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}

if (r.status !== 0) {
  console.error(`[zip] 失败 (exit ${r.status})`);
  process.exit(1);
}

const sizeMB = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`[zip] 完成: ${out} (${sizeMB} MB)`);
