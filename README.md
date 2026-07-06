# view-tool

> 本地 Web 文件浏览工具 —— 双击打开浏览器,把任意本地目录变成可预览、可搜索、可右键复制的网页。

- **两种用法**:源码 `npm start` 或打包成 Windows / macOS 单文件可执行
- **零依赖前端**:marked + highlight.js + pdf.js 全部本地化,无需联网
- **路径安全**:所有请求经 `safeResolve` 校验,越权一律 403
- **跨平台**:源码在 Windows / macOS / Linux 都能跑;二进制分发只覆盖 Windows + macOS

版本:`0.2.0` · Node: `>= 22` · 测试:81 个用例全绿

---

## 目录

- [快速开始](#快速开始)
  - [方式一:双击可执行文件(分发给非技术同事)](#方式一双击可执行文件分发给非技术同事)
  - [方式二:从源码运行(开发者)](#方式二从源码运行开发者)
- [特性](#特性)
- [命令行参数](#命令行参数)
- [HTTP API](#http-api)
- [错误码](#错误码)
- [配置文件](#配置文件)
- [浏览器 UI](#浏览器-ui)
  - [右键菜单](#右键菜单)
  - [HTML 预览的安全说明](#html-预览的安全说明)
- [支持的文件类型](#支持的文件类型)
- [跨平台"在文件管理器中打开"](#跨平台在文件管理器中打开)
- [安全模型](#安全模型)
- [项目结构](#项目结构)
  - [`lib/` 模块职责](#lib-模块职责)
- [运行测试](#运行测试)
- [构建 SEA 单文件可执行](#构建-sea-单文件可执行)
  - [构建流程](#构建流程)
  - [产物清单](#产物清单)
  - [不能交叉编译](#不能交叉编译)
- [已知限制与故障排查](#已知限制与故障排查)

---

## 快速开始

### 方式一:双击可执行文件(分发给非技术同事)

下载对应平台的二进制包,解压后双击即可启动,默认端口 `3333`,会自动用系统默认浏览器打开 `http://localhost:3333`:

| 平台 | 分发包 | 启动方式 |
|------|--------|----------|
| Windows | `view-tool-win32-x64-win.zip` | 解压 → 双击 `view-tool.exe` |
| macOS (Apple Silicon) | `view-tool-darwin-arm64-mac.zip` | 解压 → 双击 `view-tool` |
| macOS (Intel) | `view-tool-darwin-x64-mac.zip` | 同上 |

> **macOS 首次启动需绕过 Gatekeeper**:解压后首次双击会被拦截,请在 Finder 中右键 `view-tool` → **打开** → 确认。这是未签名 + ad-hoc 签名的通用限制。
>
> **Windows SmartScreen 可能拦截**:双击未签名的 `.exe` 会弹出"Windows protected your PC"蓝色提示,请点击 **更多信息** → **仍要运行**。

启动后浏览器访问 `http://localhost:3333`。按 `Ctrl+C`(Windows)或 `⌘+.`(macOS)停止服务。

### 方式二:从源码运行(开发者)

需要 Node.js **22 或更高**(`engines` 字段声明)。

```bash
git clone <repo>           # 或直接下载源码 zip
cd view-tool
npm install                # 仅安装 express(运行时)+ esbuild/postject(SEA 构建)
npm start                  # 等价于 node server.js
```

启动后:

- 终端会打印带边框的启动 banner(显示访问地址、根目录、配置文件位置)
- 默认自动用浏览器打开 `http://localhost:3333`
- 配置改完 `Ctrl+C` 重启即生效

**关于 `config.json`**:`config.json` 不在仓库里(已 gitignore,避免本地路径泄漏)。首次 clone 后没有这个文件,服务端会用内置默认值启动,`rootDir` 默认走 `process.cwd()`。通过 UI 改根目录会自动创建本地 `config.json`,但不会进入 git。

---

## 特性

- **左侧树形目录导航**,懒加载展开,目录排在文件前面(`zh-Hans-CN` 排序),每 5 秒自动刷新且差量复用未变化行
- **右侧文件预览**:文本 / Markdown / 代码高亮 / 图片 / PDF 分页 / HTML(sandbox iframe)
- **运行时在线切换根目录**:工具栏"修改"按钮 → 弹窗输入新路径 → 即时刷新,落盘到 `config.json`
- **根目录历史快速切换**:工具栏"切换"按钮展示置顶路径和最近路径,点击即可切回常用目录
- **路径防越权**:所有 API 路径经 `safeResolve` 校验,`..`、绝对路径注入、null 字节、空串一律拒绝
- **大文件自动转下载**:超过 `maxPreviewSize`(默认 5 MB)的文本文件直接返回下载链接
- **无构建步骤(源码模式)**;可选打包成 ~90 MB Windows / ~85 MB macOS 单文件
- **右键菜单**:复制绝对路径、复制相对路径、复制文件名、用文件管理器打开所在路径
- **跨平台 reveal**:Windows 用 `explorer /select,<file>`,macOS 用 `open -R`,Linux 回退 `xdg-open`
- **启动后自动打开浏览器**;SSH / 无 GUI 环境自动跳过并提示手动访问
- **优雅退出**:`SIGINT` / `SIGTERM` 触发 `server.close`,3 秒兜底强制退出
- **端口占用友好提示**:被占用时打印配置文件位置 + 改端口示例

---

## 命令行参数

```
node server.js [选项]
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--root <path>` | 启动时使用的根目录 | `config.json` 的 `rootDir` 或 `process.cwd()` |
| `--port <n>` | HTTP 端口 | `config.json` 的 `port` 或 `3333` |
| `--no-open` | 启动后不自动打开浏览器 | 自动打开(SSH / 无 DISPLAY 时已自动跳过) |
| `--config <path>` | 自定义 config.json 路径 | 见[配置文件位置](#配置文件位置) |

示例:

```bash
node server.js --root "D:\其他目录" --port 8080 --no-open
node server.js --config ~/.view-tool.json
```

优先级:**CLI** `--config` > `--root` / `--port` > 配置文件 > 内置默认值。`--root` 是临时启动覆盖,不会自动写入历史路径。

---

## HTTP API

服务监听 `http://localhost:<port>`,所有路径参数都用相对根目录的正斜杠形式(如 `sub/file.md`),所有错误响应形如 `{"error":{"code":"...","message":"..."}}`。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/config` | 读取当前根目录、历史路径与配置版本。响应:`{ rootDir, recentRoots, pinnedRoots, version, port }` |
| `POST` | `/api/config` | 修改根目录,body `{ "rootDir": "<绝对路径>" }`,成功后写入 `recentRoots` 并落盘到 `config.json` |
| `POST` | `/api/roots/pin` | 置顶一个存在的根目录,body `{ "rootDir": "<绝对路径>" }` |
| `POST` | `/api/roots/unpin` | 取消置顶根目录,body `{ "rootDir": "<绝对路径>" }` |
| `POST` | `/api/roots/remove` | 从历史和置顶列表移除根目录,body `{ "rootDir": "<绝对路径>" }` |
| `GET` | `/api/tree?path=<rel>` | 列出一层目录,返回 `{ current, entries:[{ name, type, size, mtimeMs }] }` |
| `GET` | `/api/file?path=<rel>` | 读取文件元数据 + 文本内容(若可预览),详见[支持的文件类型](#支持的文件类型) |
| `GET` | `/api/raw?path=<rel>` | 流式下载文件原始字节(图片、PDF、二进制、大文件均用此端点) |
| `POST` | `/api/reveal` | 在系统文件管理器中打开 / 选中,body `{ "path": "<rel>" }`,响应 `{ ok, kind }` |

`/api/tree` 会显示以 `.` 开头的文件 / 目录,符号链接仍会被跳过(`buildTree` 显式 `isSymbolicLink()` 过滤)。`mtimeMs` 是该文件或目录自身最后修改时间的 Unix 毫秒时间戳。`/api/file`、`/api/raw` 可读取根目录内通过 `safeResolve` 校验的文件。

---

## 错误码

`lib/errors.js` 统一抛出,所有错误响应:

```json
{ "error": { "code": "PATH_ESCAPE", "message": "..." } }
```

| code | HTTP | 触发场景 |
|------|------|----------|
| `BAD_REQUEST` | 400 | `POST /api/config` body 缺 `rootDir` / 路径不是目录 |
| `IS_DIRECTORY` | 400 | 对目录调用 `/api/file` 或 `/api/raw` |
| `NOT_A_DIRECTORY` | 400 | `POST /api/config` 给的路径不是目录 |
| `PATH_ESCAPE` | 403 | `safeResolve` 校验失败:`..` 越权 / 绝对路径落在 root 外 / 包含 null 字节 / 空串 / 非字符串 |
| `EACCES` | 403 | 文件系统权限不足 |
| `NOT_FOUND` | 404 | 路径不存在 / reveal 时启动子进程失败(ENOENT) |
| `READ_FAILED` | 500 | 读文件失败 / reveal 收到未知 kind |
| `UNSUPPORTED_PLATFORM` | 501 | 当前 OS 不在 reveal 支持列表(目前只兜底 aix 等冷门平台) |

---

## 配置文件

### 字段

| 字段 | 类型 | 说明 | 默认 |
|------|------|------|------|
| `rootDir` | string | 浏览的根目录(绝对路径) | `process.cwd()` |
| `recentRoots` | string[] | 最近成功通过 UI 切换过的根目录,最多 10 条 | `[]` |
| `pinnedRoots` | string[] | 用户置顶的常用根目录 | `[]` |
| `port` | number | HTTP 端口 | `3333` |
| `maxPreviewSize` | number | 预览文件最大字节数,超过转下载 | `5242880`(5 MB) |
| `version` | number | 配置 schema 版本 | `1` |

### 配置文件位置

| 模式 | 路径 | 是否在仓库 |
|------|------|----------|
| 源码运行(`npm start`) | `<项目根>/config.json` | ❌ gitignore,本地自维护 |
| Windows SEA 二进制 | `%APPDATA%\view-tool\config.json` | ❌ 首次运行时创建 |
| macOS SEA 二进制 | `~/Library/Application Support/view-tool/config.json` | ❌ 首次运行时创建 |
| Linux SEA 二进制 | `$XDG_CONFIG_HOME/view-tool/config.json`(回退 `~/.config/view-tool/config.json`) | ❌ 首次运行时创建 |

源码模式下文件不存在时,服务端会用内置 `DEFAULTS`(`lib/config-store.js`)启动;通过 UI 或 `POST /api/config` 修改根目录会**首次自动创建**该文件。`config.json` 已加入 `.gitignore`,不会进仓库,也不会被误提交。

`lib/user-paths.js#isSea()` 通过检测二进制同目录是否存在 `view-tool.blob` 来区分源码 / SEA 模式 —— **不要把 blob 单独移走**,否则 `isSea()` 误判为源码模式,会回退到工作目录下的 `config.json`。

写入采用**临时文件 + rename** 原子替换(`config-store.js`),不会写到一半崩了留下半截 JSON。

---

## 浏览器 UI

打开 `http://localhost:<port>` 后,布局是经典三段式:

```
┌────────────────────────────────────────────────────┐
│ 📁 根目录: D:\projects       [修改]      v1  :3333 │   ← toolbar
├──────────────┬─────────────────────────────────────┤
│              │  home > src > lib                  │   ← breadcrumb
│   目录树     ├─────────────────────────────────────┤
│   (懒加载)   │                                     │
│              │   文件预览区                        │
│              │                                     │
└──────────────┴─────────────────────────────────────┘
```

### 右键菜单

在目录树任意节点上右键,**单例 DOM + 绝对定位**,不会和节点行抢焦点:

| 操作 | 复制的值 |
|------|---------|
| 复制绝对路径 | `rootDir + '\\' + fullPath`(Windows)或 `rootDir + '/' + fullPath`(其他) |
| 复制相对路径 | API 已用 `/` 分隔的相对根路径(根目录为 `.`) |
| 复制文件名 | 仅叶子名 |
| 用文件管理器打开所在路径 | 触发 `POST /api/reveal` |

复制实现:`navigator.clipboard.writeText` 优先(需 secure context),不可用时回退到隐藏 `<textarea>` + `execCommand('copy')`。

### HTML 预览的安全说明

`<iframe sandbox="allow-scripts">` 加载,opaque origin —— 脚本**会跑**,但 iframe 与父页跨源,父页拿不到 DOM 控制权。**适合** Tailwind CDN、`<script>` 交互类的本地页面;**预览不信任的 HTML 时请注意脚本会随 srcdoc 一起执行**。

`tests/html-preview.test.js` 锁住两条防回归规则:

1. iframe 的 `sandbox` 属性必须包含 `allow-scripts`(历史上曾用 `allow-same-origin` 让 Tailwind 布局全崩)
2. iframe 的 `className` 必须是 `.html-preview`(历史上误用 `.pdf-preview`)

---

## 支持的文件类型

`lib/file-reader.js` 根据扩展名分四类,前端按 `type` 字段决定渲染方式:

| `type` | 触发扩展名 | 前端表现 |
|--------|----------|----------|
| `text` | `.md` `.markdown` `.json` `.html` `.htm` `.xml` `.css` `.js` `.mjs` `.cjs` `.jsx` `.ts` `.mts` `.cts` `.tsx` `.py` `.sh` `.bash` `.zsh` `.ps1` `.yml` `.yaml` `.toml` `.ini` `.env` `.properties` `.conf` `.csv` `.txt` `.log` | Markdown / JSON / HTML 专用预览，其余文本走带语言标签的代码预览 + highlight.js |
| `image` | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` | `<img>` 直接渲染,`/api/raw` 提供字节 |
| `pdf` | `.pdf` | pdf.js 分页渲染,带上一页 / 下一页 |
| `binary-too-large` | 任何文件 `size > maxPreviewSize` | 灰色卡片 + 下载按钮 |
| `binary` | `.pptx` `.docx` `.xlsx` `.zip` 等其他 | 灰色卡片 + 文件名/大小 + 下载按钮 |

HTML 预览额外把相对路径(`src` / `href` / `url()`)重写到 `/api/raw?path=...`,MD 中的 `<img src="...">` 同理。

---

## 跨平台"在文件管理器中打开"

`lib/reveal.js` 暴露纯函数 `buildRevealCommand(absPath, kind)`,路由 `/api/reveal` 调用。平台分支:

| 平台 | 文件 `kind: 'file'` | 目录 `kind: 'dir'` |
|------|---------------------|--------------------|
| `win32` | `explorer.exe /select,<abs>` | `explorer.exe <abs>` |
| `darwin` | `open -R <abs>`(Finder 高亮) | `open <abs>` |
| `linux` | `xdg-open <parent>`(无跨桌面"选中"标准,回退打开父目录) | `xdg-open <abs>` |
| 其它 | 抛 `UNSUPPORTED_PLATFORM` (501) | 同上 |

Windows 测试用 `skip: process.platform !== 'win32'` 跳过,darwin / linux 用 `Object.defineProperty(process, 'platform', ...)` 注入跨平台可跑。

---

## 安全模型

1. **所有 API 路径先 `path.resolve`,再校验必须落在 `rootDir` 内** —— `lib/path-guard.js#safeResolve`
2. 越权访问返回 403 `{"error":{"code":"PATH_ESCAPE",...}}`,覆盖:
   - `..` 单层 / 多层(`../../etc/passwd`)
   - 绝对路径注入(`C:\Windows\System32`)
   - null 字节(`a.txt\0.bak`)
   - 空字符串 / 非字符串
3. `rootDir` 只能通过 CLI(`--root`)或 `POST /api/config` 显式修改,无文件遍历式注入面
4. HTML 预览 sandbox 在"脚本可用"和"不可同源操控父页"之间取得平衡 —— 见[HTML 预览的安全说明](#html-预览的安全说明)
5. 服务监听 `localhost`,**不暴露到外网**;若需远程访问请自行加反向代理 + 鉴权

---

## 项目结构

```
view-tool/
├── package.json
├── package-lock.json
├── sea-config.json              # SEA 构建清单(useCodeCache / disableExperimentalSEAWarning)
├── server.js                    # Express 入口:CLI 解析 + 配置加载 + 6 个路由 + 启动 banner
├── .gitignore
│
├── lib/
│   ├── errors.js                # AppError + Codes + toResponse
│   ├── path-guard.js            # safeResolve / isWithinRoot(防越权)
│   ├── config-store.js          # 配置文件加载 + 原子写入
│   ├── tree-builder.js          # 单层目录列表,可配置隐藏项显示,过滤符号链接,目录优先
│   ├── file-reader.js           # 元信息 + 文本读取 + 流下载 + MIME 表
│   ├── reveal.js                # 平台特定 reveal 命令构造(纯函数)
│   └── user-paths.js            # 跨平台用户数据目录 + isSea() 检测
│
├── public/
│   ├── index.html               # 工具栏 + 目录树 + 预览 + 右键菜单 DOM
│   ├── app.js                   # 前端逻辑(原生 ESM,无框架)
│   ├── tree-title.mjs           # 目录树悬停标题与大小 / 时间格式化
│   ├── tree-refresh.mjs         # 目录树自动刷新间隔与路径规划
│   ├── tree-reconcile.mjs       # 目录树差量刷新复用判断
│   ├── styles.css               # 全部样式
│   └── vendor/                  # 本地化的 marked / highlight.js / pdf.js
│
├── scripts/
│   ├── bundle-public.js         # public/ → base64 内嵌 → lib/public-bundle.gen.js
│   ├── build-sea.js             # esbuild + SEA + postject + 签名
│   └── zip-artifact.js          # Windows → Compress-Archive;macOS → ditto
│
├── tests/                       # 81 个 node --test 用例
│   ├── path-guard.test.js       # 8 个
│   ├── config-store.test.js     # 6 个
│   ├── tree-builder.test.js     # 7 个
│   ├── file-reader.test.js      # 8 个
│   ├── reveal.test.js           # 9 个(win32 + darwin + linux + 异常)
│   ├── html-preview.test.js     # 4 个(sandbox + className 回归保护)
│   ├── tree-title.test.mjs      # 6 个(目录树悬停标题格式)
│   ├── tree-refresh.test.mjs    # 4 个(自动刷新间隔与路径规划)
│   ├── tree-reconcile.test.mjs  # 5 个(差量刷新复用规则)
│   └── tree-auto-refresh-ui.test.js # 7 个(自动刷新前端接线)
│
└── (gitignore)
    ├── node_modules/            # 依赖
    ├── dist/                    # SEA 构建产物
    │   ├── view-tool[.exe]
    │   └── view-tool-*.zip
    ├── config.json              # 本地配置(含 rootDir)
    ├── start.bat                # Windows 一键启动(等价 npm start)
    ├── docs/                    # 内部 TDD 设计 / 计划
    ├── *.blob                   # SEA prep / runtime blob
    ├── lib/public-bundle.gen.js # public/ 内嵌 base64(SEA 构建生成)
    ├── lib/server.bundled.cjs   # esbuild bundle(SEA 构建生成)
    └── sea-config.bundled.json  # 临时 SEA 清单(SEA 构建生成)
```

### `lib/` 模块职责

| 文件 | 输入 | 输出 | 副作用 |
|------|------|------|--------|
| `errors.js` | `code, message, status` | `AppError` 实例 | 无 |
| `path-guard.js` | `rootDir, requested` | 绝对路径(越权时抛 `PATH_ESCAPE`) | 无 |
| `config-store.js` | `filePath, cliOverrides` | 配置对象 | 写文件时 `mkdir -p` + 临时文件 rename |
| `tree-builder.js` | `rootDir, path, opts` | `{ current, entries }` | `fs.readdirSync` |
| `file-reader.js` | `rootDir, path, opts` | `{ name, path, type, mime, size, content? }` | `fs.readFileSync` / `createReadStream` |
| `reveal.js` | `absolutePath, kind` | `{ cmd, args }` | 无(纯函数,spawn 在路由层做) |
| `user-paths.js` | — | 用户目录 / config 路径 / `isSea()` | `mkdir -p` + `fs.existsSync` |

所有模块**零外部依赖**(只用 `node:` 内建模块),便于单测和 SEA 打包。

---

## 运行测试

```bash
npm test
```

使用 Node 内置 `node --test`,无第三方测试框架。**当前 81 个用例,0 跳过 / 0 失败**,覆盖:

- `lib/path-guard.js`:8 个防越权用例(`..` / 绝对路径注入 / null 字节 / 空串等)
- `lib/config-store.js`:6 个配置读写用例(缺失文件 / 损坏 JSON / 原子写入 / 自动建目录)
- `lib/tree-builder.js`:7 个目录树用例(类型标记 / 修改时间 / 隐藏过滤 / 排序 / 空目录)
- `lib/file-reader.js`:8 个文件读取用例(MIME / 文本 / 图片 / PDF / 二进制 / 超大 / 目录)
- `lib/reveal.js`:9 个跨平台 reveal 用例(3 个 win32 + 2 个 darwin + 2 个 linux + 2 个异常)
- `tests/html-preview.test.js`:4 个 HTML 预览样式 / sandbox 回归保护
- `tests/tree-title.test.mjs`:6 个目录树悬停标题格式用例(修改时间 / 文件大小 / 回退行为)
- `tests/tree-refresh.test.mjs`:4 个目录树自动刷新路径规划用例
- `tests/tree-reconcile.test.mjs`:5 个目录树差量刷新复用规则用例
- `tests/tree-auto-refresh-ui.test.js`:7 个目录树自动刷新前端接线用例

新增模块时请保持"先写测试再写实现"的节奏,确保总用例数同步更新。

---

## 构建 SEA 单文件可执行

### 构建流程

```bash
# Windows 二进制(必须在 Windows 主机上跑)
npm run dist:win
# 产物: dist/view-tool.exe + dist/view-tool-win32-x64-win.zip

# macOS 二进制(必须在 macOS 主机上跑)
npm run dist:mac
# 产物: dist/view-tool + dist/view-tool-darwin-<arch>-mac.zip
```

`npm run build:win` / `build:mac` 只产二进制,不带 zip;`dist:win` / `dist:mac` 在 build 基础上再 zip。

脚本细节:

1. `scripts/bundle-public.js` 把 `public/` 打成 base64,输出 `lib/public-bundle.gen.js`(SEA 模式下从内存提供静态资源,免去 `express.static` 的运行时读盘)
2. esbuild 把 `server.js` + 全部 `node_modules` 打成单个 CJS bundle,约 3 MB
3. `node --experimental-sea-config` 生成 SEA prep blob,启用 `useCodeCache: true` 加速冷启动
4. 复制 host node 二进制作为产物骨架
5. macOS 专属:`codesign --remove-signature` → `postject` 注入 → ad-hoc 重签(`codesign --sign -`)
6. Windows 专属:`postject` 注入(Windows 自带的代码签名警告可忽略,运行时不影响)
7. `ditto`(macOS) / `Compress-Archive`(Windows)打成 zip

### 产物清单

| 产物 | 说明 | 体积(预期) |
|------|------|-------------|
| `dist/view-tool.exe` | Windows 单文件可执行 | ~90 MB |
| `dist/view-tool-win32-x64-win.zip` | Windows 分发包 | ~33 MB |
| `dist/view-tool` | macOS 单文件可执行 | ~85 MB |
| `dist/view-tool-darwin-arm64-mac.zip` | macOS Apple Silicon 分发包 | ~30 MB |
| `dist/view-tool-darwin-x64-mac.zip` | macOS Intel 分发包 | ~30 MB |
| `dist/view-tool.blob` | SEA blob 副本(供 `isSea()` 检测) | ~3 MB |

zip 文件名格式:`view-tool-<hostTag>-<target>.zip`,其中 `hostTag = ${process.platform}-${process.arch}`。

### 不能交叉编译

| 目标平台 | 必须的构建主机 |
|---------|---------------|
| Windows `.exe` | Windows |
| macOS arm64 | macOS Apple Silicon |
| macOS x64 | macOS Intel(或 Rosetta 下也行) |

请在对应平台或 CI runner 上分别跑 `npm run dist:win` / `dist:mac`。

---

## 已知限制与故障排查

### 功能限制

- **不支持**文件搜索 / 过滤、上传、编辑、用户认证 —— 仅"浏览 + 预览 + 下载"
- **防越权粒度**为单根目录,不支持多根目录白名单
- **PDF 渲染**首次访问 PDF 才会加载 `pdf.worker.min.mjs`(按需)
- **HTML 预览**的 iframe sandbox 允许脚本运行(opaque origin),预览不可信 HTML 时请注意脚本会执行

### 分发签名问题

- **macOS 首次启动需绕过 Gatekeeper**(右键 → 打开)。需要 Apple Developer ID($99/年)+ notarization 才能消除警告,v2 会做正式签名
- **Windows SmartScreen 可能拦截**未签名的 `.exe`,点击"更多信息"→"仍要运行"即可。代码签名证书约 $200/年能彻底解决
- **防病毒软件可能误报**未签名的 Node 二进制,若被拦截请提交误报反馈

### 常见报错

- **`端口 3333 已被占用`**:用 `--port <其它端口>` 启动(如 `node server.js --port 8080`),或在本地 `config.json` 的 `port` 字段修改
- **在 SSH / WSL 等无 GUI 环境**:服务会正常启动但跳过自动开浏览器,终端会打印手动访问地址
- **`rootDir 不存在或不是目录,回退到 process.cwd()`**:`config.json` 里写了无效路径(可手动编辑本地 `config.json`,或在 UI 里改)
