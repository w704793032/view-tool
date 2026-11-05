# 前端 vendor 库清单

所有库都保存在 `public/vendor/`，由 `scripts/bundle-public.js` 在 SEA 构建时内嵌进二进制。
运行时不需要联网，也不依赖 `node_modules` 里的第三方包。

| 文件 | 版本 | 许可证 | 用途 |
|------|------|--------|------|
| `marked.min.js` | 既有版本 | MIT | Markdown 渲染 |
| `highlight.min.js` | 11.9.0 | BSD-3-Clause | 代码语法高亮（内置 36 种语言） |
| `pdf.min.mjs` / `pdf.worker.min.mjs` | 既有版本 | Apache-2.0 | PDF 分页渲染 |
| `docx-preview.js` | 0.4.1 | Apache-2.0 | Word 文档渲染为 HTML |
| `jszip.min.js` | 3.10.2 | MIT / GPL-3.0 | 解压 docx（docx-preview 依赖） |
| `xlsx.full.min.js` | 0.20.3 | Apache-2.0 | Excel 解析与表格渲染 |
| `hljs/*.min.mjs` | 11.9.0 | BSD-3-Clause | 按需加载的额外语法（PowerShell / Dockerfile / Dart 等） |

## 为什么 SheetJS 不从 npm 安装

npm 上的 `xlsx` 最新版停在 `0.18.5`（2022 年），存在已公开的原型污染与 ReDoS 问题，
修复版本只通过 [cdn.sheetjs.com](https://cdn.sheetjs.com/) 分发。因此这里直接 vendor
官方 CDN 的 `0.20.3` 浏览器构建，并在升级时同步更新本文件。

## 升级注意事项

1. 新库必须是纯浏览器可用的 UMD / ESM，不能含 Node 原生扩展。
2. 放进 `public/vendor/` 后无需改构建脚本，`bundle-public.js` 会递归打包。
3. 新增按需语法时，文件名必须与 highlight.js 的 language id 一致，
   并同时更新 `public/app.js` 的 `EXTRA_HLJS_LANGUAGES`。
4. 升级后跑 `npm test`，并确认 SEA 产物体积没有异常膨胀。
