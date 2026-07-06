'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const express = require('express');

const { ConfigStore } = require('./lib/config-store');
const {
  addRecentRoot,
  pinRoot,
  unpinRoot,
  removeRoot,
} = require('./lib/root-history');
const { buildTree } = require('./lib/tree-builder');
const { readFileMeta, streamFile, MIME } = require('./lib/file-reader');
const { AppError, toResponse, Codes } = require('./lib/errors');
const { safeResolve } = require('./lib/path-guard');
const { buildRevealCommand } = require('./lib/reveal');
const { userConfigPath, isSea } = require('./lib/user-paths');

// public-bundle.gen.js 由 scripts/bundle-public.js 在 SEA 构建时生成并打进 blob。
// 源码运行（npm start）下不存在此文件，自动回退到 express.static。
let publicBundle = null;
try {
  publicBundle = require('./lib/public-bundle.gen');
} catch {
  publicBundle = null;
}

function parseCli(argv) {
  const args = { root: null, port: null, noOpen: false, config: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root' && i + 1 < argv.length) args.root = argv[++i];
    else if (a === '--port' && i + 1 < argv.length) args.port = Number(argv[++i]);
    else if (a === '--no-open') args.noOpen = true;
    else if (a === '--config' && i + 1 < argv.length) args.config = argv[++i];
  }
  return args;
}

/** 自动用系统默认浏览器打开 url。失败不影响服务。 */
function openBrowser(url) {
  // SSH / 无 GUI 场景下跳过自启，让用户手动复制 URL
  if (process.env.SSH_CONNECTION && !process.env.DISPLAY) {
    console.log(`[view-tool] 检测到无 GUI 环境，请手动访问: ${url}`);
    return;
  }
  try {
    let cmd, args;
    if (process.platform === 'win32') {
      // `start` 是 cmd 内建，必须经 cmd /c；第一个 "" 是 start 要求的窗口标题占位
      cmd = 'cmd'; args = ['/c', 'start', '""', url];
    } else if (process.platform === 'darwin') {
      cmd = 'open'; args = [url];
    } else {
      cmd = 'xdg-open'; args = [url];
    }
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch (err) {
    console.log(`[view-tool] 无法自动打开浏览器 (${err.message})，请手动访问: ${url}`);
  }
}

/** 根据扩展名查 MIME；命中 SEA bundle 时使用，未命中回退到 express.static */
function guessMime(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function start() {
  const cli = parseCli(process.argv.slice(2));

  // 配置路径优先级：CLI --config > SEA 模式用用户目录 > 源码模式用项目内 config.json
  const configPath = cli.config
    ? path.resolve(cli.config)
    : (isSea() ? userConfigPath() : path.join(__dirname, 'config.json'));

  const cliOverrides = {};
  if (cli.root) cliOverrides.rootDir = path.resolve(cli.root);
  if (cli.port && Number.isFinite(cli.port)) cliOverrides.port = cli.port;

  const store = new ConfigStore(configPath, cliOverrides);
  const config = store.load();
  let rootDir = config.rootDir || process.cwd();

  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    console.error(`[view-tool] rootDir 不存在或不是目录：${rootDir}，回退到 process.cwd()`);
    rootDir = process.cwd();
  }

  const port = config.port || 3333;
  const app = express();
  app.use(express.json());

  function configPayload() {
    return {
      rootDir,
      recentRoots: config.recentRoots || [],
      pinnedRoots: config.pinnedRoots || [],
      version: config.version,
      port,
    };
  }

  app.get('/api/config', (_req, res) => {
    res.json(configPayload());
  });

  app.post('/api/config', (req, res) => {
    const { rootDir: newRoot } = req.body || {};
    if (typeof newRoot !== 'string' || newRoot.length === 0) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'rootDir 必填' } });
    }
    const abs = path.resolve(newRoot);
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: '该路径不存在' } });
    }
    if (!fs.statSync(abs).isDirectory()) {
      return res.status(400).json({ error: { code: 'NOT_A_DIRECTORY', message: '该路径不是一个目录' } });
    }
    rootDir = abs;
    Object.assign(config, addRecentRoot({ ...config, rootDir: abs }, abs));
    store.save(config);
    res.json(configPayload());
  });

  function readRootBody(req, res) {
    const value = req.body && req.body.rootDir;
    if (typeof value !== 'string' || value.length === 0) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'rootDir required' } });
      return null;
    }
    return path.resolve(value);
  }

  app.post('/api/roots/pin', (req, res) => {
    const abs = readRootBody(req, res);
    if (!abs) return;
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Path does not exist' } });
    }
    if (!fs.statSync(abs).isDirectory()) {
      return res.status(400).json({ error: { code: 'NOT_A_DIRECTORY', message: 'Path is not a directory' } });
    }
    Object.assign(config, pinRoot(config, abs));
    store.save(config);
    res.json(configPayload());
  });

  app.post('/api/roots/unpin', (req, res) => {
    const abs = readRootBody(req, res);
    if (!abs) return;
    Object.assign(config, unpinRoot(config, abs));
    store.save(config);
    res.json(configPayload());
  });

  app.post('/api/roots/remove', (req, res) => {
    const abs = readRootBody(req, res);
    if (!abs) return;
    Object.assign(config, removeRoot(config, abs));
    store.save(config);
    res.json(configPayload());
  });

  app.get('/api/tree', (req, res) => {
    try {
      const requested = typeof req.query.path === 'string' ? req.query.path : '.';
      const result = buildTree(rootDir, requested, { showHidden: true });
      res.json(result);
    } catch (err) {
      const r = toResponse(err);
      res.status(r.status).json(r.body);
    }
  });

  app.get('/api/file', (req, res) => {
    try {
      const requested = typeof req.query.path === 'string' ? req.query.path : '';
      const meta = readFileMeta(rootDir, requested, { maxPreviewSize: config.maxPreviewSize });
      res.json(meta);
    } catch (err) {
      const r = toResponse(err);
      res.status(r.status).json(r.body);
    }
  });

  app.get('/api/raw', (req, res) => {
    try {
      const requested = typeof req.query.path === 'string' ? req.query.path : '';
      const { stream, size, ext } = streamFile(rootDir, requested);
      const mime = MIME[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', size);
      stream.pipe(res);
    } catch (err) {
      const r = toResponse(err);
      res.status(r.status).json(r.body);
    }
  });

  app.post('/api/reveal', (req, res) => {
    try {
      const requested = (req.body && typeof req.body.path === 'string') ? req.body.path : '';
      const target = safeResolve(rootDir, requested);
      const stat = fs.statSync(target);
      const kind = stat.isDirectory() ? 'dir' : 'file';
      const { cmd, args } = buildRevealCommand(target, kind);
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: false });
      let errored = false;
      child.on('error', (err) => {
        errored = true;
        const code = err.code === 'ENOENT' ? Codes.NOT_FOUND : Codes.EACCES;
        const r = toResponse(new AppError(code, `无法启动文件管理器：${err.message}`, 500));
        if (!res.headersSent) res.status(r.status).json(r.body);
      });
      child.unref();
      if (!errored) res.json({ ok: true, kind });
    } catch (err) {
      const r = toResponse(err);
      res.status(r.status).json(r.body);
    }
  });

  // 静态资源：SEA 模式下从内存 bundle 提供；源码模式下回退到 express.static
  if (publicBundle) {
    app.use((req, res, next) => {
      let rel = decodeURIComponent(req.path.replace(/^\/+/, ''));
      if (rel === '') rel = 'index.html';
      const buf = publicBundle[rel];
      if (buf) {
        res.setHeader('Content-Type', guessMime(rel));
        res.setHeader('Content-Length', buf.length);
        return res.end(buf);
      }
      next();
    });
  } else {
    app.use(express.static(path.join(__dirname, 'public')));
  }

  app.use((err, _req, res, _next) => {
    const r = toResponse(err);
    res.status(r.status).json(r.body);
  });

  const server = app.listen(port, () => {
    const url = `http://localhost:${port}`;
    const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s).padEnd(n, ' ');
    const banner = [
      '',
      '  ╭───────────────────────────────────────────────────────────╮',
      `  │   view-tool 已启动                                          │`,
      `  │   访问地址:  ${pad(url, 47)}│`,
      `  │   根目录:    ${pad(rootDir, 47)}│`,
      `  │   配置文件:  ${pad(configPath, 47)}│`,
      `  │   按 Ctrl+C 停止                                             │`,
      '  ╰───────────────────────────────────────────────────────────╯',
      '',
    ].join('\n');
    console.log(banner);
    if (!cli.noOpen) openBrowser(url);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[view-tool] 端口 ${port} 已被占用。`);
      console.error(`  · 修改配置文件中的 port 字段: ${configPath}`);
      console.error(`  · 或使用 --port <其它端口> 启动: view-tool --port ${port + 1}`);
      console.error(`  · 或释放该端口后重试`);
      process.exit(1);
    }
    console.error(`[view-tool] 启动失败:`, err);
    process.exit(1);
  });

  const shutdown = (sig) => () => {
    console.log(`\n[view-tool] 收到 ${sig}，正在停止服务...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
}

start();
