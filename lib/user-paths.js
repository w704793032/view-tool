'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

/**
 * 返回 view-tool 跨平台的可写用户数据目录，不存在则自动创建。
 *   Windows: %APPDATA%\view-tool  (回退 %USERPROFILE%\AppData\Roaming\view-tool)
 *   macOS:   ~/Library/Application Support/view-tool
 *   Linux:   $XDG_CONFIG_HOME/view-tool  (回退 ~/.config/view-tool)
 */
function userDataDir() {
  const home = os.homedir();
  let base;
  if (process.platform === 'win32') {
    base = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    base = path.join(home, 'Library', 'Application Support');
  } else {
    base = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  }
  const dir = path.join(base, 'view-tool');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 返回用户数据目录下的 config.json 绝对路径。 */
function userConfigPath() {
  return path.join(userDataDir(), 'config.json');
}

/**
 * 判断当前是否在 SEA 单文件可执行程序中运行。
 * 约定：构建脚本把生成的 sea-prep.blob 命名为 view-tool.blob 并放在 exe 旁边。
 */
function isSea() {
  try {
    const blob = path.join(path.dirname(process.execPath), 'view-tool.blob');
    return fs.existsSync(blob);
  } catch {
    return false;
  }
}

module.exports = { userDataDir, userConfigPath, isSea };
