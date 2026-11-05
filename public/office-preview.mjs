'use strict';

/**
 * Word / Excel 预览。
 *
 * 两个格式都是 ZIP + XML 容器，服务端只负责把原始字节流给浏览器，
 * 解析和渲染全部在本地完成（不联网、不依赖系统安装 Office）。
 *
 * - docx: docx-preview + JSZip
 * - xlsx: SheetJS（官方 CDN 0.20.x，npm 上的 0.18.5 已停更且有安全问题）
 */

const scriptCache = new Map();

export const DOCX_SCRIPT_SOURCES = ['vendor/jszip.min.js', 'vendor/docx-preview.js'];
export const XLSX_SCRIPT_SOURCES = ['vendor/xlsx.full.min.js'];

// 单次预览最多渲染的行 / 列，避免超大表格把 DOM 撑爆
export const XLSX_PREVIEW_MAX_ROWS = 500;
export const XLSX_PREVIEW_MAX_COLS = 80;
// 读取阶段先截断行数，避免 20 MB 的 xlsx 解压出上百 MB 单元格
export const XLSX_READ_MAX_ROWS = 2000;

const BLOCKED_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button',
]);

export function loadScript(src) {
  if (scriptCache.has(src)) return scriptCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`无法加载 ${src}`));
    document.head.appendChild(el);
  });
  scriptCache.set(src, promise);
  // 失败后允许下次重试，避免一次网络抖动永久卡死
  promise.catch(() => scriptCache.delete(src));
  return promise;
}

async function fetchArrayBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`读取文件失败（HTTP ${res.status}）`);
  return res.arrayBuffer();
}

/** 清理第三方库生成的 DOM：去掉可执行标签、事件属性、外链。 */
export function sanitizeOfficeTree(root) {
  for (const el of [...root.querySelectorAll('*')]) {
    const tag = el.tagName.toLowerCase();
    if (BLOCKED_TAGS.has(tag)) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith('on') || name === 'srcdoc') {
        el.removeAttribute(attr.name);
        continue;
      }
      if (/^\s*(javascript|vbscript):/i.test(value) || /^\s*data:text\/html/i.test(value)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === 'href' && !value.startsWith('#') && !value.startsWith('/api/')) {
        // 预览区在主文档里，保留外部 href 会让点击直接离开工具页
        el.removeAttribute(attr.name);
        continue;
      }
      if ((name === 'src' || name === 'xlink:href') && /^https?:/i.test(value)) {
        // 离线工具不应在预览时发起外部请求
        el.removeAttribute(attr.name);
      }
    }
  }
  for (const style of root.querySelectorAll('style')) {
    style.textContent = style.textContent
      .replace(/@import[^;]+;/gi, '')
      .replace(/url\(\s*['"]?https?:[^)]*\)/gi, 'none');
  }
}

export async function createDocxPreview(meta) {
  for (const src of DOCX_SCRIPT_SOURCES) await loadScript(src);
  if (!window.docx || typeof window.docx.renderAsync !== 'function') {
    throw new Error('Word 渲染库未正确加载');
  }
  const data = await fetchArrayBuffer(meta.downloadUrl);
  const wrap = document.createElement('div');
  wrap.className = 'docx-preview';
  const body = document.createElement('div');
  body.className = 'docx-preview-body';
  wrap.appendChild(body);
  try {
    await window.docx.renderAsync(data, body, null, {
      className: 'docx',
      inWrapper: true,
      breakPages: false,
      ignoreLastRenderedPageBreak: true,
      renderHeaders: true,
      renderFooters: true,
    });
  } catch (err) {
    throw new Error(`Word 文档解析失败：${err.message}`);
  }
  sanitizeOfficeTree(body);
  return wrap;
}

/** 计算需要渲染的范围；返回的 range 一定落在原范围之内。 */
export function clampSheetRange(range, maxRows = XLSX_PREVIEW_MAX_ROWS, maxCols = XLSX_PREVIEW_MAX_COLS) {
  const rowCount = range.e.r - range.s.r + 1;
  const colCount = range.e.c - range.s.c + 1;
  return {
    range: {
      s: { r: range.s.r, c: range.s.c },
      e: {
        r: Math.min(range.e.r, range.s.r + maxRows - 1),
        c: Math.min(range.e.c, range.s.c + maxCols - 1),
      },
    },
    truncated: rowCount > maxRows || colCount > maxCols,
  };
}

function sliceSheet(XLSX, ws, range) {
  const out = { '!ref': XLSX.utils.encode_range(range) };
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr]) out[addr] = ws[addr];
    }
  }
  if (Array.isArray(ws['!merges'])) {
    const merges = ws['!merges'].filter((m) =>
      m.s.r >= range.s.r && m.e.r <= range.e.r && m.s.c >= range.s.c && m.e.c <= range.e.c);
    if (merges.length) out['!merges'] = merges;
  }
  return out;
}

function buildSheetTable(XLSX, ws) {
  const fullRef = ws['!fullref'] || ws['!ref'];
  if (!fullRef) {
    const empty = document.createElement('div');
    empty.className = 'placeholder';
    empty.textContent = '这张工作表是空的';
    return { node: empty, truncated: false };
  }
  const fullRange = XLSX.utils.decode_range(fullRef);
  const { range, truncated } = clampSheetRange(fullRange);
  const sheet = truncated ? sliceSheet(XLSX, ws, range) : ws;
  const html = XLSX.utils.sheet_to_html(sheet, {
    id: 'xlsx-table',
    editable: false,
    header: '',
    footer: '',
  });
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  sanitizeOfficeTree(tpl.content);
  const table = tpl.content.querySelector('table');
  if (!table) {
    const fallback = document.createElement('div');
    fallback.className = 'placeholder';
    fallback.textContent = '无法渲染这张工作表';
    return { node: fallback, truncated };
  }
  table.classList.add('xlsx-table');
  return { node: table, truncated };
}

export async function createXlsxPreview(meta) {
  for (const src of XLSX_SCRIPT_SOURCES) await loadScript(src);
  if (!window.XLSX) throw new Error('Excel 解析库未正确加载');
  const XLSX = window.XLSX;
  const data = await fetchArrayBuffer(meta.downloadUrl);

  let wb;
  try {
    wb = XLSX.read(data, {
      type: 'array',
      cellDates: true,
      sheetRows: XLSX_READ_MAX_ROWS,
    });
  } catch (err) {
    throw new Error(`Excel 文件解析失败：${err.message}`);
  }
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('Excel 文件里没有工作表');
  }

  const wrap = document.createElement('div');
  wrap.className = 'xlsx-preview';

  const toolbar = document.createElement('div');
  toolbar.className = 'xlsx-toolbar';
  const nameEl = document.createElement('span');
  nameEl.className = 'xlsx-name';
  nameEl.textContent = meta.name;
  const infoEl = document.createElement('span');
  infoEl.className = 'xlsx-info';
  toolbar.append(nameEl, infoEl);

  const tabs = document.createElement('div');
  tabs.className = 'xlsx-tabs';
  tabs.setAttribute('role', 'tablist');

  const host = document.createElement('div');
  host.className = 'xlsx-sheet';

  const note = document.createElement('div');
  note.className = 'xlsx-note';
  note.hidden = true;

  const buttons = wb.SheetNames.map((sheetName, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'xlsx-tab';
    btn.textContent = sheetName;
    btn.setAttribute('role', 'tab');
    btn.addEventListener('click', () => show(index));
    tabs.appendChild(btn);
    return btn;
  });

  function show(index) {
    const sheetName = wb.SheetNames[index];
    const built = buildSheetTable(XLSX, wb.Sheets[sheetName]);
    host.replaceChildren(built.node);
    buttons.forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
      btn.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
    infoEl.textContent = `${index + 1} / ${wb.SheetNames.length} 个工作表`;
    note.hidden = !built.truncated;
    note.textContent = built.truncated
      ? `内容较大，仅预览前 ${XLSX_PREVIEW_MAX_ROWS} 行 / ${XLSX_PREVIEW_MAX_COLS} 列`
      : '';
  }

  wrap.append(toolbar);
  if (wb.SheetNames.length > 1) wrap.appendChild(tabs);
  wrap.append(host, note);
  show(0);
  return wrap;
}
