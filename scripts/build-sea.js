'use strict';

/**
 * Node.js SEA 单文件可执行程序构建脚本。
 *
 * 用法:
 *   node scripts/build-sea.js win      # 产出 dist/view-tool.exe
 *   node scripts/build-sea.js mac      # 产出 dist/view-tool
 *
 * 构建步骤:
 *   1. 用 esbuild 把 server.js + 全部 node_modules 依赖打包成单个 CJS bundle
 *   2. 生成临时 sea-config.json，main 指向 bundle
 *   3. 跑 node --experimental-sea-config 生成 prep blob
 *   4. 复制 host node 二进制作为产物骨架
 *   5. (macOS) codesign --remove-signature
 *   6. postject 注入 blob
 *   7. (macOS) codesign --sign - (ad-hoc)
 *   8. 拷贝 blob 备用
 *
 * 注意事项:
 *   - 必须在与目标平台相同的 OS 上构建（无交叉编译）
 *   - 需要 Node 22 LTS 或更新版本（24 LTS 也支持）
 *   - 需要已 npm install
 *   - macOS 还需要 Xcode 命令行工具（codesign）
 */

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { inject } = require('postject');
const esbuild = require('esbuild');

const target = process.argv[2];
if (!['win', 'mac'].includes(target)) {
  console.error('用法: node scripts/build-sea.js <win|mac>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const isMac = target === 'mac';
const ext = isMac ? '' : '.exe';
const binaryName = `view-tool${ext}`;
const blobName = 'view-tool.blob';

const hostNode = process.execPath;
const distDir = path.join(root, 'dist');
const outBinary = path.join(distDir, binaryName);
const prepBlob = path.join(root, 'sea-prep.blob');
const bundleGen = path.join(root, 'lib', 'public-bundle.gen.js');
const bundleOut = path.join(root, 'lib', 'server.bundled.cjs');
const seaCfgPath = path.join(root, 'sea-config.bundled.json');

function step(msg) { console.log(`\n[sea] ${msg}`); }
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

(async () => {
  try {
    // 0) 准备
    fs.mkdirSync(distDir, { recursive: true });
    for (const p of [outBinary, prepBlob, bundleGen, bundleOut, seaCfgPath]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    // 1) 把 public/ 打成内存 bundle（被 server.js require，会被 esbuild 进一步内联）
    step('打包 public/ -> lib/public-bundle.gen.js');
    run(process.execPath, [path.join(root, 'scripts', 'bundle-public.js')], { cwd: root });

    // 2) esbuild 把 server.js + 全部 node_modules 打成单个 CJS bundle
    step('esbuild 打包 server.js + 依赖 -> lib/server.bundled.cjs');
    const bundleResult = await esbuild.build({
      entryPoints: [path.join(root, 'server.js')],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      outfile: bundleOut,
      // 不打包 node: 内建模块（应该自动跳过，但显式写更安全）
      external: ['node:*'],
      // 让 express 的 require('./package.json') 等被内联而非运行时读
      loader: { '.json': 'json' },
      logLevel: 'info',
    });
    if (bundleResult.errors && bundleResult.errors.length > 0) {
      throw new Error('esbuild 报告错误: ' + JSON.stringify(bundleResult.errors));
    }
    const bundleSize = (fs.statSync(bundleOut).size / 1024).toFixed(1);
    console.log(`[sea] bundle 体积: ${bundleSize} KB`);

    // 3) 写临时 sea-config.json（指向 bundle）
    step('写临时 sea-config.json -> sea-config.bundled.json');
    const seaCfg = {
      main: 'lib/server.bundled.cjs',
      output: 'sea-prep.blob',
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true,
    };
    fs.writeFileSync(seaCfgPath, JSON.stringify(seaCfg, null, 2) + '\n', 'utf8');

    // 4) 生成 SEA prep blob
    step(`生成 SEA prep blob (使用 ${path.basename(hostNode)})`);
    run(hostNode, ['--experimental-sea-config', seaCfgPath], { cwd: root });
    if (!fs.existsSync(prepBlob)) {
      throw new Error(`未生成 ${prepBlob}，请检查 Node 版本是否 >= 22`);
    }
    const blobSize = (fs.statSync(prepBlob).size / 1024).toFixed(1);
    console.log(`[sea] blob 体积: ${blobSize} KB`);

    // 5) 复制 host node 二进制作为产物骨架
    step(`复制 node 二进制 -> ${path.relative(root, outBinary)}`);
    fs.copyFileSync(hostNode, outBinary);
    fs.chmodSync(outBinary, 0o755);

    // 6) macOS 专属：移除已有签名（postject 修改 __TEXT 段前必须）
    if (isMac) {
      step('移除已有代码签名 (codesign --remove-signature)');
      const r = spawnSync('codesign', ['--remove-signature', outBinary], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error('codesign --remove-signature 失败');
    }

    // 7) 注入 blob
    step('注入 SEA blob (postject)');
    const blobBuffer = fs.readFileSync(prepBlob);
    const injectOptions = {
      sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    };
    if (isMac) injectOptions.machoSegmentName = 'NODE_SEA_BLOB';
    await inject(outBinary, 'NODE_SEA_BLOB', blobBuffer, injectOptions);

    // 8) macOS 专属：ad-hoc 重签（让本机 Finder 至少能启动）
    if (isMac) {
      step('ad-hoc 重新签名 (codesign --sign -)');
      const r = spawnSync('codesign', ['--sign', '-', '--force', outBinary], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error('codesign --sign - 失败');
    }

    // 9) 拷贝 blob 备用（方便 user-paths.js 的 isSea() 检测）
    fs.copyFileSync(prepBlob, path.join(distDir, blobName));

    const sizeMB = (fs.statSync(outBinary).size / 1024 / 1024).toFixed(1);
    console.log(`\n[sea] 完成: ${outBinary} (${sizeMB} MB)`);
    console.log(`[sea] 下一步: 运行 npm run dist:${target} 一并打包成 zip`);
  } catch (err) {
    console.error(`\n[sea] 构建失败:`, err.message);
    process.exit(1);
  } finally {
    // 清理临时文件（不管成功失败都清理）
    for (const p of [prepBlob, bundleGen, bundleOut, seaCfgPath]) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
    }
  }
})();
