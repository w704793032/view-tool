import { buildTreeTitle, formatBytes } from './tree-title.mjs';
import {
  TREE_REFRESH_INTERVAL_MS,
  getTreeRefreshPaths,
} from './tree-refresh.mjs';
import {
  canReuseTreeNode,
  getDirectTreeNodes,
  toTreeEntryInfo,
} from './tree-reconcile.mjs';

// ============== 状态 ==============
const state = {
  rootDir: '',
  recentRoots: [],
  pinnedRoots: [],
  currentPath: '.',
  selectedFile: null,
  expandedDirs: new Set(['.']),
  jsonLargeConfirmed: new Set(),
  treeRefreshTimer: null,
  treeRefreshInFlight: false,
};

// ============== 工具 ==============
function showToast(msg, opts = {}) {
  // 向后兼容：showToast(msg, duration) —— 把数字第二参数当 duration
  if (typeof opts === 'number') opts = { duration: opts };
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('success', opts.kind === 'success');
  el.classList.toggle('error', opts.kind === 'error');
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, opts.duration ?? 3000);
}

function showError(msg) {
  const main = document.getElementById('preview');
  main.innerHTML = `<div class="error-card">${escapeHtml(msg)}</div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function joinPath(base, child) {
  if (!base || base === '.') return child;
  return `${base}/${child}`;
}

// 绝对路径：根目录时只返回根；子项时拼上 fullPath，统一用反斜杠（Windows 原生）
function toAbsolutePath(rootDir, fullPath) {
  if (!rootDir) return '';
  if (!fullPath || fullPath === '.') return rootDir;
  return rootDir + '\\' + fullPath.replace(/\//g, '\\');
}

// 相对路径：保持原样（API 已用 / 分隔）；根目录为 '.'
function toRelativePath(fullPath) {
  return (!fullPath || fullPath === '.') ? '.' : fullPath;
}

// 写剪贴板：clipboard API 优先，execCommand 兜底（兼容非 secure context）
async function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) { /* 落入兜底 */ }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

// 截断字符串用于菜单预览
function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ============== 右键菜单 ==============
let ctxMenuTarget = null;  // { fullPath, name, type }

// 命名引用，便于 removeEventListener
let lifecycleKeydown = null;
let lifecycleDocClick = null;
let lifecycleDocContext = null;

function renderContextMenuItems() {
  const { fullPath, name } = ctxMenuTarget;
  const abs = toAbsolutePath(state.rootDir, fullPath);
  const rel = toRelativePath(fullPath);
  const leaf = name || '(根目录)';
  document.getElementById('ctxmenu').innerHTML = `
    <button class="ctx-item" data-kind="absolute">
      <span class="ctx-label">复制绝对路径</span>
      <span class="ctx-hint" title="${escapeHtml(abs)}">${escapeHtml(truncate(abs, 36))}</span>
    </button>
    <button class="ctx-item" data-kind="relative">
      <span class="ctx-label">复制相对路径</span>
      <span class="ctx-hint" title="${escapeHtml(rel)}">${escapeHtml(truncate(rel, 36))}</span>
    </button>
    <button class="ctx-item" data-kind="leaf">
      <span class="ctx-label">复制文件名</span>
      <span class="ctx-hint" title="${escapeHtml(leaf)}">${escapeHtml(truncate(leaf, 36))}</span>
    </button>
    <button class="ctx-item" data-kind="reveal">
      <span class="ctx-label">用文件管理器打开所在路径</span>
      <span class="ctx-hint">在资源管理器中打开</span>
    </button>
  `;
}

function positionContextMenu(ev) {
  const menu = document.getElementById('ctxmenu');
  menu.hidden = false;  // 先取消隐藏才能测尺寸
  const { innerWidth: vw, innerHeight: vh } = window;
  const margin = 4;
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;

  // 默认：光标右下方；超出则翻转
  let x = ev.clientX;
  let y = ev.clientY;
  if (x + w + margin > vw) x = Math.max(margin, ev.clientX - w);
  if (y + h + margin > vh) y = Math.max(margin, ev.clientY - h);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

function openContextMenu(ev, row, info) {
  ev.preventDefault();  // 阻止浏览器原生菜单
  ev.stopPropagation(); // 阻止冒泡到 document 监听器（否则 lifecycleDocContext 会在同一事件里立刻关闭刚开的菜单）
  closeContextMenu();   // 先关旧的，防堆叠
  ctxMenuTarget = {
    fullPath: row.dataset.path,
    name: info.name,
    type: row.dataset.type,
  };
  renderContextMenuItems();
  positionContextMenu(ev);
  installLifecycleListeners();
}

function closeContextMenu() {
  const menu = document.getElementById('ctxmenu');
  if (!menu) return;
  menu.hidden = true;
  ctxMenuTarget = null;
  removeLifecycleListeners();
}

function installLifecycleListeners() {
  lifecycleKeydown = (ev) => {
    if (ev.key === 'Escape') closeContextMenu();
  };
  lifecycleDocClick = (ev) => {
    // 点击菜单外（左键）才关；菜单项 click 由 onContextMenuClick 处理并 stopPropagation
    if (!ev.target.closest('#ctxmenu')) closeContextMenu();
  };
  lifecycleDocContext = (ev) => {
    // 右键菜单外：阻止原生菜单并关闭当前菜单（行 contextmenu 会重新 open）
    if (!ev.target.closest('#ctxmenu')) {
      ev.preventDefault();
      closeContextMenu();
    }
  };
  window.addEventListener('keydown', lifecycleKeydown);
  document.addEventListener('click', lifecycleDocClick);
  document.addEventListener('contextmenu', lifecycleDocContext);
}

function removeLifecycleListeners() {
  if (lifecycleKeydown) {
    window.removeEventListener('keydown', lifecycleKeydown);
    lifecycleKeydown = null;
  }
  if (lifecycleDocClick) {
    document.removeEventListener('click', lifecycleDocClick);
    lifecycleDocClick = null;
  }
  if (lifecycleDocContext) {
    document.removeEventListener('contextmenu', lifecycleDocContext);
    lifecycleDocContext = null;
  }
}

async function onContextMenuClick(ev) {
  const btn = ev.target.closest('.ctx-item');
  if (!btn || !ctxMenuTarget) return;
  ev.stopPropagation();  // 防止冒泡到外层 "点击即关闭"
  const { fullPath, name } = ctxMenuTarget;
  const kind = btn.dataset.kind;

  if (kind === 'reveal') {
    const rel = toRelativePath(fullPath);
    closeContextMenu();
    try {
      await apiPost('/api/reveal', { path: rel });
      showToast(name ? `已在文件管理器中打开：${name}` : '已在文件管理器中打开根目录',
        { kind: 'success', duration: 2000 });
    } catch (err) {
      showToast('打开失败：' + err.message,
        { kind: 'error', duration: 4000 });
    }
    return;
  }

  let text;
  if (kind === 'absolute') text = toAbsolutePath(state.rootDir, fullPath);
  else if (kind === 'relative') text = toRelativePath(fullPath);
  else if (kind === 'leaf') text = name;
  else return;

  const ok = await writeClipboard(text);
  closeContextMenu();
  if (ok) {
    showToast(name ? `已复制：${name}` : '已复制根目录路径', { kind: 'success', duration: 2000 });
  } else {
    showToast('复制失败：剪贴板不可用', { kind: 'error', duration: 4000 });
  }
}

function installPermanentListeners() {
  // 树容器存在期间永久有效
  document.getElementById('tree').addEventListener('scroll', closeContextMenu);
  window.addEventListener('resize', closeContextMenu);
  window.addEventListener('blur', closeContextMenu);
}

function suppressNativeContextMenuOnCtxMenu() {
  document.getElementById('ctxmenu').addEventListener('contextmenu', (ev) => ev.preventDefault());
}

// ============== API 客户端 ==============
async function apiGet(url) {
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `HTTP ${r.status}`);
  return data;
}

async function apiPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `HTTP ${r.status}`);
  return data;
}

// ============== 配置（根目录） ==============
function applyConfig(cfg) {
  state.rootDir = cfg.rootDir;
  state.recentRoots = Array.isArray(cfg.recentRoots) ? cfg.recentRoots : [];
  state.pinnedRoots = Array.isArray(cfg.pinnedRoots) ? cfg.pinnedRoots : [];
  document.getElementById('rootDirLabel').textContent = cfg.rootDir;
  document.getElementById('configBadge').textContent = `端口 ${cfg.port}`;
}

async function loadConfig() {
  const cfg = await apiGet('/api/config');
  applyConfig(cfg);
}

async function changeRootDir(newRoot) {
  const cfg = await apiPost('/api/config', { rootDir: newRoot });
  applyConfig(cfg);
  state.currentPath = '.';
  state.selectedFile = null;
  state.expandedDirs = new Set(['.']);
  await renderBreadcrumb();
  await renderTree();
  document.getElementById('preview').innerHTML =
    '<div class="placeholder">从左侧选择文件以预览</div>';
  closeRootMenu();
}

function rootLeaf(root) {
  return root.split(/[\\/]/).filter(Boolean).pop() || root;
}

function closeRootMenu() {
  const menu = document.getElementById('rootMenu');
  const btn = document.getElementById('switchRootBtn');
  if (!menu || !btn) return;
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

function renderRootMenu() {
  const menu = document.getElementById('rootMenu');
  const pinned = state.pinnedRoots;
  const pinnedSet = new Set(pinned);
  const recent = state.recentRoots.filter((root) => !pinnedSet.has(root));
  const sections = [
    ['置顶', pinned],
    ['最近', recent],
  ].filter(([, roots]) => roots.length > 0);

  if (sections.length === 0) {
    menu.innerHTML = '<div class="root-menu-empty">暂无历史路径</div>';
    return;
  }

  menu.innerHTML = '';
  for (const [title, roots] of sections) {
    const heading = document.createElement('div');
    heading.className = 'root-menu-heading';
    heading.textContent = title;
    menu.appendChild(heading);

    for (const root of roots) {
      const row = document.createElement('div');
      row.className = 'root-menu-item';
      if (root === state.rootDir) row.classList.add('active');

      const main = document.createElement('button');
      main.className = 'root-menu-main';
      main.type = 'button';
      main.title = root;
      main.dataset.root = root;

      const nameEl = document.createElement('span');
      nameEl.className = 'root-menu-name';
      nameEl.textContent = rootLeaf(root);

      const pathEl = document.createElement('span');
      pathEl.className = 'root-menu-path';
      pathEl.textContent = root;

      main.append(nameEl, pathEl);

      const pin = document.createElement('button');
      pin.className = 'root-menu-action';
      pin.type = 'button';
      pin.title = pinnedSet.has(root) ? '取消置顶' : '置顶';
      pin.dataset.action = pinnedSet.has(root) ? 'unpin' : 'pin';
      pin.dataset.root = root;
      pin.textContent = pinnedSet.has(root) ? '★' : '☆';

      const remove = document.createElement('button');
      remove.className = 'root-menu-action';
      remove.type = 'button';
      remove.title = '移除';
      remove.dataset.action = 'remove';
      remove.dataset.root = root;
      remove.textContent = '×';

      row.append(main, pin, remove);
      menu.appendChild(row);
    }
  }
}

async function syncRootList(url, rootDir) {
  const cfg = await apiPost(url, { rootDir });
  applyConfig(cfg);
  renderRootMenu();
}

function setupRootSwitcher() {
  const btn = document.getElementById('switchRootBtn');
  const menu = document.getElementById('rootMenu');

  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    renderRootMenu();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });

  menu.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const actionBtn = ev.target.closest('.root-menu-action');
    if (actionBtn) {
      const root = actionBtn.dataset.root;
      const action = actionBtn.dataset.action;
      try {
        if (action === 'pin') await syncRootList('/api/roots/pin', root);
        if (action === 'unpin') await syncRootList('/api/roots/unpin', root);
        if (action === 'remove') await syncRootList('/api/roots/remove', root);
      } catch (err) {
        showToast(err.message, { kind: 'error', duration: 4000 });
      }
      return;
    }

    const item = ev.target.closest('.root-menu-main');
    if (!item) return;
    const root = item.dataset.root;
    if (root === state.rootDir) {
      closeRootMenu();
      return;
    }
    try {
      await changeRootDir(root);
      showToast(`已切换到：${rootLeaf(root)}`, { kind: 'success', duration: 2000 });
    } catch (err) {
      showToast(`切换失败：${err.message}`, { kind: 'error', duration: 4000 });
      renderRootMenu();
    }
  });

  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.root-switch')) closeRootMenu();
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeRootMenu();
  });
}

// ============== 目录树 ==============
async function fetchTree(path) {
  return apiGet(`/api/tree?path=${encodeURIComponent(path)}`);
}

function renderNode(parentPath, name, info, depth, options = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'tree-node';
  wrap.dataset.path = info.fullPath;
  wrap.dataset.type = info.type;

  const row = document.createElement('div');
  row.className = 'tree-row';
  row.dataset.path = info.fullPath;
  row.dataset.type = info.type;
  // 悬停时显示完整名称，避免被 ellipsis 截断后看不全
  row.title = buildTreeTitle(name, info);

  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle';
  toggle.textContent = info.type === 'dir' ? '▶' : '';

  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  icon.textContent = info.type === 'dir' ? '📁' : '📄';

  const label = document.createElement('span');
  label.className = 'tree-name';
  label.textContent = name;

  row.append(toggle, icon, label);
  if (info.type === 'file' && info.size != null) {
    const sz = document.createElement('span');
    sz.className = 'tree-count';
    sz.textContent = formatBytes(info.size);
    row.append(sz);
  }

  if (info.type === 'dir' && state.expandedDirs.has(info.fullPath)) {
    row.classList.add('expanded');
    toggle.textContent = '▼';
  }

  if (state.selectedFile === info.fullPath) {
    row.classList.add('selected');
  }

  row.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (info.type === 'dir') {
      toggleDir(info.fullPath, row);
    } else {
      selectFile(info.fullPath, row);
    }
  });

  row.addEventListener('contextmenu', (ev) => {
    openContextMenu(ev, row, info);
  });

  wrap.appendChild(row);

  if (info.type === 'dir' && state.expandedDirs.has(info.fullPath)) {
    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'tree-children';
    childrenWrap.dataset.path = info.fullPath;
    wrap.appendChild(childrenWrap);
    if (options.autoLoadChildren !== false) {
      loadChildren(info.fullPath, childrenWrap, options);
    }
  }

  return wrap;
}

async function toggleDir(fullPath, rowEl) {
  if (state.expandedDirs.has(fullPath)) {
    state.expandedDirs.delete(fullPath);
    const childrenWrap = rowEl.parentElement.querySelector(`.tree-children[data-path="${cssEscape(fullPath)}"]`);
    if (childrenWrap) childrenWrap.remove();
    rowEl.querySelector('.tree-toggle').textContent = '▶';
  } else {
    state.expandedDirs.add(fullPath);
    rowEl.querySelector('.tree-toggle').textContent = '▼';
    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'tree-children';
    childrenWrap.dataset.path = fullPath;
    rowEl.parentElement.appendChild(childrenWrap);
    await loadChildren(fullPath, childrenWrap);
  }
}

function cssEscape(s) {
  return s.replace(/(["\\])/g, '\\$1');
}

function directChildByClass(el, className) {
  return Array.from(el.children).find((child) => child.classList.contains(className));
}

function treeRowForNode(node) {
  return directChildByClass(node, 'tree-row');
}

function treeInfoForNode(node) {
  const row = treeRowForNode(node);
  return {
    fullPath: row?.dataset.path,
    type: row?.dataset.type,
  };
}

function setTextIfChanged(el, value) {
  if (el && el.textContent !== value) el.textContent = value;
}

function syncTreeRowSize(row, info) {
  let sizeEl = row.querySelector('.tree-count');
  if (info.type === 'file' && info.size != null) {
    if (!sizeEl) {
      sizeEl = document.createElement('span');
      sizeEl.className = 'tree-count';
      row.append(sizeEl);
    }
    setTextIfChanged(sizeEl, formatBytes(info.size));
    return;
  }
  if (sizeEl) sizeEl.remove();
}

function updateTreeNode(node, parentPath, name, info, options = {}) {
  const row = treeRowForNode(node);
  if (!row) return renderNode(parentPath, name, info, 0, options);

  node.dataset.path = info.fullPath;
  node.dataset.type = info.type;
  row.dataset.path = info.fullPath;
  row.dataset.type = info.type;

  const title = buildTreeTitle(name, info);
  if (row.title !== title) row.title = title;

  const toggle = row.querySelector('.tree-toggle');
  const icon = row.querySelector('.tree-icon');
  const label = row.querySelector('.tree-name');
  const expanded = info.type === 'dir' && state.expandedDirs.has(info.fullPath);

  setTextIfChanged(toggle, info.type === 'dir' ? (expanded ? '▼' : '▶') : '');
  setTextIfChanged(icon, info.type === 'dir' ? '📁' : '📄');
  setTextIfChanged(label, name);
  syncTreeRowSize(row, info);

  row.classList.toggle('expanded', expanded);
  row.classList.toggle('selected', state.selectedFile === info.fullPath);

  const childrenWrap = directChildByClass(node, 'tree-children');
  if (expanded && !childrenWrap) {
    const nextChildren = document.createElement('div');
    nextChildren.className = 'tree-children';
    nextChildren.dataset.path = info.fullPath;
    node.appendChild(nextChildren);
    if (options.autoLoadChildren !== false) {
      loadChildren(info.fullPath, nextChildren, options);
    }
  } else if (!expanded && childrenWrap) {
    childrenWrap.remove();
  }

  return node;
}

function placeNode(container, marker, node) {
  const target = marker ? marker.nextSibling : container.firstChild;
  if (node !== target) container.insertBefore(node, target);
  return node;
}

function reconcileEntries(parentPath, entries, container, options = {}) {
  const existingNodes = getDirectTreeNodes(container);
  const existingByPath = new Map();
  for (const node of existingNodes) {
    const info = treeInfoForNode(node);
    if (info.fullPath) existingByPath.set(info.fullPath, node);
  }

  const emptyEl = directChildByClass(container, 'tree-empty');
  if (entries.length === 0) {
    for (const node of existingNodes) node.remove();
    if (!emptyEl) {
      const nextEmpty = document.createElement('div');
      nextEmpty.className = 'tree-empty';
      nextEmpty.textContent = '（空目录）';
      container.appendChild(nextEmpty);
    }
    return;
  }
  if (emptyEl) emptyEl.remove();

  const used = new Set();
  let marker = null;
  for (const entry of entries) {
    const info = toTreeEntryInfo(parentPath, entry);
    const existingNode = existingByPath.get(info.fullPath);
    const existingInfo = existingNode ? treeInfoForNode(existingNode) : null;
    const nextNode = canReuseTreeNode(existingInfo, info)
      ? updateTreeNode(existingNode, parentPath, entry.name, info, options)
      : renderNode(parentPath, entry.name, info, 0, options);

    marker = placeNode(container, marker, nextNode);
    used.add(nextNode);
  }

  for (const node of existingNodes) {
    if (!used.has(node)) node.remove();
  }
}

function renderEntries(parentPath, entries, container, options = {}) {
  if (options.reconcile === true) {
    reconcileEntries(parentPath, entries, container, options);
    return;
  }

  container.innerHTML = '';
  if (entries.length === 0) {
    container.innerHTML = '<div class="tree-empty">（空目录）</div>';
    return;
  }
  for (const entry of entries) {
    const full = joinPath(parentPath, entry.name);
    const info = { ...entry, fullPath: full };
    container.appendChild(renderNode(parentPath, entry.name, info, 0, options));
  }
}

async function loadChildren(fullPath, container, options = {}) {
  const silent = options.silent === true;
  if (!silent) container.innerHTML = '<div class="tree-empty">加载中…</div>';
  try {
    const data = await fetchTree(fullPath);
    renderEntries(fullPath, data.entries, container, options);
  } catch (err) {
    if (silent && container.childElementCount > 0) {
      console.warn(`刷新目录失败：${fullPath}`, err);
      return;
    }
    container.innerHTML = `<div class="tree-empty">加载失败：${escapeHtml(err.message)}</div>`;
  }
}

async function renderTree(options = {}) {
  const root = document.getElementById('tree');
  const silent = options.silent === true;
  if (!silent) root.innerHTML = '';
  try {
    const data = await fetchTree('.');
    renderEntries('.', data.entries, root, options);
    return true;
  } catch (err) {
    if (silent) {
      console.warn('刷新目录树失败', err);
      return false;
    }
    throw err;
  }
}

async function refreshVisibleChildren(paths) {
  for (const fullPath of paths) {
    if (fullPath === '.') continue;
    const container = document.querySelector(`.tree-children[data-path="${cssEscape(fullPath)}"]`);
    if (!container) continue;
    await loadChildren(fullPath, container, {
      silent: true,
      autoLoadChildren: false,
      reconcile: true,
    });
  }
}

async function refreshTree() {
  if (state.treeRefreshInFlight) return;
  state.treeRefreshInFlight = true;
  try {
    const paths = getTreeRefreshPaths(state.expandedDirs);
    const ok = await renderTree({
      silent: true,
      autoLoadChildren: false,
      reconcile: true,
    });
    if (ok) await refreshVisibleChildren(paths);
  } finally {
    state.treeRefreshInFlight = false;
  }
}

function setupTreeAutoRefresh() {
  if (state.treeRefreshTimer) return;
  state.treeRefreshTimer = setInterval(() => refreshTree(), TREE_REFRESH_INTERVAL_MS);
}

// ============== 文件预览 ==============
async function selectFile(filePath, rowEl) {
  state.selectedFile = filePath;
  state.currentPath = filePath;
  document.querySelectorAll('.tree-row.selected').forEach((el) => el.classList.remove('selected'));
  if (rowEl) rowEl.classList.add('selected');
  await renderBreadcrumb();
  await renderPreview(filePath);
}

async function renderPreview(filePath) {
  const main = document.getElementById('preview');
  main.innerHTML = '<div class="placeholder">加载中…</div>';
  try {
    const meta = await apiGet(`/api/file?path=${encodeURIComponent(filePath)}`);
    main.innerHTML = '';
    switch (meta.type) {
      case 'text': renderText(main, meta, filePath); break;
      case 'image': renderImage(main, meta); break;
      case 'pdf': renderPdf(main, meta); break;
      case 'binary-too-large': renderBinaryTooLarge(main, meta); break;
      case 'binary': renderBinary(main, meta); break;
      default: main.innerHTML = `<div class="error-card">未知文件类型：${meta.type}</div>`;
    }
  } catch (err) {
    showError(`预览失败：${err.message}`);
  }
}

async function renderDirectoryPreview(dirPath) {
  const main = document.getElementById('preview');
  main.innerHTML = '<div class="placeholder">加载中…</div>';
  try {
    const data = await fetchTree(dirPath);
    const card = document.createElement('div');
    card.className = 'binary-card';
    const dirs = data.entries.filter((e) => e.type === 'dir');
    const files = data.entries.filter((e) => e.type === 'file');
    card.innerHTML = `
      <div class="icon">📁</div>
      <div class="name">${escapeHtml(data.current)}</div>
      <div class="meta">${dirs.length} 个目录 · ${files.length} 个文件</div>
      <div class="meta" style="max-width: 480px; text-align: left;">${escapeHtml(dirs.map((d) => d.name).join(' · '))}</div>
    `;
    main.innerHTML = '';
    main.appendChild(card);
  } catch (err) {
    showError(`加载目录失败：${err.message}`);
  }
}

function renderText(container, meta, filePath) {
  const ext = filePath.split('.').pop().toLowerCase();

  if (ext === 'md' || ext === 'markdown') {
    const div = document.createElement('div');
    div.className = 'markdown-body';
    const raw = meta.content;
    const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
    const html = window.marked.parse(raw);
    div.innerHTML = html;
    rewriteMdImages(div, dir);
    container.appendChild(div);
    if (window.hljs) {
      div.querySelectorAll('pre code').forEach((el) => window.hljs.highlightElement(el));
    }
    return;
  }

  if (ext === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(meta.content);
    } catch (err) {
      const pre = document.createElement('pre');
      pre.className = 'text-preview';
      pre.textContent = meta.content;
      container.appendChild(pre);
      const note = document.createElement('div');
      note.className = 'warning-card';
      note.textContent = `JSON 解析失败：${err.message}（已显示原文）`;
      container.appendChild(note);
      return;
    }
    const pretty = JSON.stringify(parsed, null, 2);
    if (pretty.length > 100 * 1024 && !state.jsonLargeConfirmed.has(filePath)) {
      const warn = document.createElement('div');
      warn.className = 'warning-card';
      warn.innerHTML = `文件 ${formatBytes(meta.size)} 较大，渲染可能卡顿。 <button id="confirmJson" class="btn">仍要显示</button>`;
      container.appendChild(warn);
      warn.querySelector('#confirmJson').addEventListener('click', () => {
        state.jsonLargeConfirmed.add(filePath);
        renderPreview(filePath);
      });
      return;
    }
    renderJsonTree(container, parsed);
    return;
  }

  if (ext === 'html' || ext === 'htm') {
    const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
    const rewritten = rewriteHtmlUrls(meta.content, dir);
    const iframe = document.createElement('iframe');
    iframe.className = 'html-preview';
    // 仅 allow-scripts: 让 <script>/Tailwind 运行时能跑(修复 .pptx.html 这类依赖 CDN 工具类的页面);
    // 不给 allow-same-origin, 文档是 opaque origin, 反而比原配置更安全 ——
    // 原配置既禁了脚本, 又让 iframe 与父页同源, 父页用不上这个同源能力, 纯属冗余。
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.srcdoc = rewritten;
    container.appendChild(iframe);
    return;
  }

  const pre = document.createElement('pre');
  pre.className = 'text-preview';
  pre.textContent = meta.content;
  container.appendChild(pre);
  if (window.hljs) window.hljs.highlightElement(pre);
}

function rewriteMdImages(container, mdDir) {
  if (!mdDir) return;
  container.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    if (/^(https?:|data:|\/api\/raw)/.test(src)) return;
    const fullPath = joinPath(mdDir, src);
    img.src = `/api/raw?path=${encodeURIComponent(fullPath)}`;
  });
}

function rewriteHtmlUrls(html, htmlDir) {
  if (!htmlDir) return html;
  const toRaw = (rel) => {
    if (!rel) return rel;
    if (/^(https?:|data:|#|\/\/|\/api\/raw)/.test(rel)) return rel;
    return `/api/raw?path=${encodeURIComponent(joinPath(htmlDir, rel))}`;
  };
  let out = html.replace(/(\bsrc|\bhref)=("([^"]*)"|'([^']*)')/g, (m, attr, q, v1, v2) => {
    const v = v1 != null ? v1 : v2;
    const nv = toRaw(v);
    if (nv === v) return m;
    return `${attr}=${q[0]}${nv}${q[0]}`;
  });
  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, v) => {
    const nv = toRaw(v.trim());
    if (nv === v) return m;
    return `url(${q}${nv}${q})`;
  });
  return out;
}

function renderImage(container, meta) {
  const wrap = document.createElement('div');
  wrap.className = 'image-preview';
  const img = document.createElement('img');
  img.src = meta.downloadUrl;
  img.alt = meta.name;
  wrap.appendChild(img);
  container.appendChild(wrap);
}

function renderPdf(container, meta) {
  if (!window.pdfjsLib) {
    container.innerHTML = '<div class="error-card">pdf.js 未加载</div>';
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'pdf-canvas-wrap';
  const controls = document.createElement('div');
  controls.className = 'pdf-controls';
  const prev = document.createElement('button');
  prev.className = 'btn';
  prev.textContent = '上一页';
  const next = document.createElement('button');
  next.className = 'btn';
  next.textContent = '下一页';
  const pageInfo = document.createElement('span');
  pageInfo.className = 'badge';
  controls.append(prev, pageInfo, next);
  wrap.appendChild(controls);
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  container.appendChild(wrap);

  const loadingTask = window.pdfjsLib.getDocument({ url: meta.downloadUrl });
  let pdf = null;
  let currentPage = 1;

  async function showPage(n) {
    if (!pdf) return;
    currentPage = Math.max(1, Math.min(n, pdf.numPages));
    pageInfo.textContent = `${currentPage} / ${pdf.numPages}`;
    const page = await pdf.getPage(currentPage);
    const viewport = page.getViewport({ scale: 1.2 });
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  prev.addEventListener('click', () => showPage(currentPage - 1));
  next.addEventListener('click', () => showPage(currentPage + 1));

  loadingTask.promise.then((p) => {
    pdf = p;
    showPage(1);
  }).catch((err) => {
    container.innerHTML = `<div class="error-card">PDF 加载失败：${escapeHtml(err.message)}</div>`;
  });
}

function renderBinaryTooLarge(container, meta) {
  const card = document.createElement('div');
  card.className = 'binary-card';
  card.innerHTML = `
    <div class="icon">📦</div>
    <div class="name">${escapeHtml(meta.name)}</div>
    <div class="meta">${formatBytes(meta.size)} · ${escapeHtml(meta.message || '文件超过预览限制')}</div>
    <a class="btn" href="${meta.downloadUrl}" download>下载</a>
  `;
  container.appendChild(card);
}

function renderBinary(container, meta) {
  const card = document.createElement('div');
  card.className = 'binary-card';
  card.innerHTML = `
    <div class="icon">📦</div>
    <div class="name">${escapeHtml(meta.name)}</div>
    <div class="meta">${formatBytes(meta.size)} · ${escapeHtml(meta.mime)}</div>
    <div class="meta">${escapeHtml(meta.message || '暂不支持预览')}</div>
    <a class="btn" href="${meta.downloadUrl}" download>下载</a>
  `;
  container.appendChild(card);
}

// ============== 面包屑 ==============
async function renderBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  el.innerHTML = '';
  const parts = state.currentPath.split('/').filter(Boolean);
  const rootName = state.rootDir.split(/[\\/]/).pop() || '根';

  const rootLink = document.createElement('a');
  rootLink.href = '#';
  rootLink.textContent = rootName;
  rootLink.addEventListener('click', (ev) => {
    ev.preventDefault();
    state.currentPath = '.';
    state.selectedFile = null;
    renderBreadcrumb();
    document.getElementById('preview').innerHTML =
      '<div class="placeholder">从左侧选择文件以预览</div>';
  });
  el.appendChild(rootLink);

  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = ' / ';
    el.appendChild(sep);

    acc = i === 0 ? parts[i] : `${acc}/${parts[i]}`;
    const isLast = i === parts.length - 1;
    if (isLast) {
      const span = document.createElement('span');
      span.textContent = parts[i];
      el.appendChild(span);
    } else {
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = parts[i];
      const targetPath = acc;
      link.addEventListener('click', (ev) => {
        ev.preventDefault();
        state.currentPath = targetPath;
        state.selectedFile = null;
        renderBreadcrumb();
        renderDirectoryPreview(targetPath);
      });
      el.appendChild(link);
    }
  }
}

// ============== 弹窗 ==============
function setupModal() {
  const modal = document.getElementById('modal');
  const input = document.getElementById('modalInput');
  const errEl = document.getElementById('modalError');
  const cancelBtn = document.getElementById('modalCancel');
  const confirmBtn = document.getElementById('modalConfirm');
  const openBtn = document.getElementById('changeRootBtn');

  function open() {
    input.value = state.rootDir;
    errEl.hidden = true;
    modal.hidden = false;
    setTimeout(() => input.focus(), 50);
  }
  function close() {
    modal.hidden = true;
  }

  openBtn.addEventListener('click', open);
  cancelBtn.addEventListener('click', close);
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) close();
  });

  async function confirm() {
    errEl.hidden = true;
    const v = input.value.trim();
    if (!v) {
      errEl.textContent = '请输入路径';
      errEl.hidden = false;
      return;
    }
    try {
      await changeRootDir(v);
      close();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  }

  confirmBtn.addEventListener('click', confirm);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') confirm();
    if (ev.key === 'Escape') close();
  });
}

// ============== 启动 ==============
async function main() {
  setupRootSwitcher();
  setupModal();
  installPermanentListeners();
  suppressNativeContextMenuOnCtxMenu();
  document.getElementById('ctxmenu').addEventListener('click', onContextMenuClick);
  try {
    await loadConfig();
    await renderTree();
    await renderBreadcrumb();
    setupTreeAutoRefresh();
  } catch (err) {
    showError(`初始化失败：${err.message}`);
  }
}

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.mjs';
}

main();

// ============== JSON 树视图 ==============
function buildJsonNode(key, value, depth) {
  const row = document.createElement('div');
  row.className = 'json-row';
  row.dataset.depth = String(depth);

  const toggle = document.createElement('span');
  toggle.className = 'json-toggle';
  row.appendChild(toggle);

  const isContainer = value !== null && typeof value === 'object';
  const isEmpty = isContainer && (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0);

  if (key !== null) {
    const keyEl = document.createElement('span');
    keyEl.className = 'json-key';
    keyEl.textContent = key;
    row.appendChild(keyEl);
    const colon = document.createElement('span');
    colon.className = 'json-punct';
    colon.textContent = ':';
    row.appendChild(colon);
  }

  if (!isContainer) {
    const valEl = document.createElement('span');
    if (value === null) {
      valEl.className = 'json-null';
      valEl.textContent = 'null';
    } else if (typeof value === 'string') {
      valEl.className = 'json-string';
      if (value.length > 80) {
        valEl.textContent = '"' + value.slice(0, 77) + '..."';
        valEl.title = '"' + value + '"';
      } else {
        valEl.textContent = '"' + value + '"';
      }
    } else if (typeof value === 'number') {
      valEl.className = 'json-number';
      valEl.textContent = String(value);
    } else if (typeof value === 'boolean') {
      valEl.className = 'json-boolean';
      valEl.textContent = String(value);
    }
    row.appendChild(valEl);
    return [row, null];
  }

  // Container (Object or Array)
  const openPunct = document.createElement('span');
  openPunct.className = 'json-punct';
  openPunct.textContent = Array.isArray(value) ? '[' : '{';
  row.appendChild(openPunct);

  const meta = document.createElement('span');
  meta.className = 'json-meta';
  if (isEmpty) {
    meta.textContent = ' ';
  } else {
    meta.textContent = Array.isArray(value)
      ? value.length + ' items'
      : Object.keys(value).length + ' keys';
  }
  row.appendChild(meta);

  const closePunct = document.createElement('span');
  closePunct.className = 'json-punct';
  closePunct.textContent = Array.isArray(value) ? ']' : '}';
  row.appendChild(closePunct);

  if (isEmpty) {
    return [row, null];
  }

  const children = document.createElement('div');
  children.className = 'json-children';
  children.dataset.depth = String(depth + 1);

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);
  for (const [k, v] of entries) {
    const [childRow, childChildren] = buildJsonNode(k, v, depth + 1);
    children.appendChild(childRow);
    if (childChildren) children.appendChild(childChildren);
  }

  row.dataset.hasChildren = 'true';
  toggle.dataset.hasChildren = 'true';
  return [row, children];
}

function renderJsonTree(container, value) {
  const wrap = document.createElement('div');
  wrap.className = 'json-tree';

  const toolbar = document.createElement('div');
  toolbar.className = 'json-toolbar';
  const expandBtn = document.createElement('button');
  expandBtn.className = 'btn json-expand-all';
  expandBtn.textContent = '全部展开';
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'btn json-collapse-all';
  collapseBtn.textContent = '全部收起';
  toolbar.appendChild(expandBtn);
  toolbar.appendChild(collapseBtn);
  wrap.appendChild(toolbar);

  const [rootRow, rootChildren] = buildJsonNode(null, value, 0);
  if (rootChildren) {
    rootRow.dataset.alwaysExpanded = 'true';
    rootChildren.hidden = false;
    rootRow.querySelector('.json-toggle').textContent = '▼';
    wrap.appendChild(rootRow);
    wrap.appendChild(rootChildren);
  } else {
    // 根节点是基本类型
    wrap.appendChild(rootRow);
  }

  // 事件委托
  wrap.addEventListener('click', (ev) => {
    if (ev.target.closest('.json-expand-all')) {
      wrap.querySelectorAll('.json-children').forEach((c) => { c.hidden = false; });
      wrap.querySelectorAll('.json-toggle').forEach((t) => {
        if (t.dataset.hasChildren === 'true') t.textContent = '▼';
      });
      return;
    }
    if (ev.target.closest('.json-collapse-all')) {
      wrap.querySelectorAll('.json-children').forEach((c) => {
        const parentRow = c.previousElementSibling;
        if (parentRow && parentRow.dataset.alwaysExpanded === 'true') return;
        c.hidden = true;
      });
      wrap.querySelectorAll('.json-toggle').forEach((t) => {
        if (t.dataset.hasChildren !== 'true') return;
        const parentRow = t.closest('.json-row');
        if (parentRow && parentRow.dataset.alwaysExpanded === 'true') return;
        t.textContent = '▶';
      });
      return;
    }
    const row = ev.target.closest('.json-row');
    if (!row || row.dataset.hasChildren !== 'true' || row.dataset.alwaysExpanded === 'true') return;
    const children = row.nextElementSibling;
    if (children && children.classList.contains('json-children')) {
      children.hidden = !children.hidden;
      const toggle = row.querySelector('.json-toggle');
      toggle.textContent = children.hidden ? '▶' : '▼';
    }
  });

  container.appendChild(wrap);
}
