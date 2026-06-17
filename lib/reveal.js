'use strict';

const path = require('node:path');
const { AppError, Codes } = require('./errors');

/**
 * 构造当前平台下"在文件管理器中打开"的命令。
 *
 *  - win32:  explorer.exe /select,<file>  或  explorer.exe <dir>
 *  - darwin: open -R <file>  (Finder 中高亮)  或  open <dir>
 *  - linux:  xdg-open <dir>  (无跨桌面标准的"选中文件"命令，回退打开父目录)
 *  - 其它:   抛 UNSUPPORTED_PLATFORM / 501
 */
function buildRevealCommand(absolutePath, kind) {
  if (kind !== 'file' && kind !== 'dir') {
    throw new AppError(Codes.READ_FAILED, `未知 kind: ${kind}`, 500);
  }

  switch (process.platform) {
    case 'win32': {
      if (kind === 'file') return { cmd: 'explorer.exe', args: [`/select,${absolutePath}`] };
      return { cmd: 'explorer.exe', args: [absolutePath] };
    }
    case 'darwin': {
      if (kind === 'file') return { cmd: 'open', args: ['-R', absolutePath] };
      return { cmd: 'open', args: [absolutePath] };
    }
    case 'linux': {
      // 没有跨桌面的"在文件管理器中选中"标准接口。
      // 回退到打开父目录，对 nautilus / dolphin / thunar 等都有效。
      if (kind === 'file') {
        return { cmd: 'xdg-open', args: [path.dirname(absolutePath)] };
      }
      return { cmd: 'xdg-open', args: [absolutePath] };
    }
    default:
      throw new AppError(
        Codes.UNSUPPORTED_PLATFORM,
        `当前平台 (${process.platform}) 暂不支持"在文件管理器中打开"`,
        501
      );
  }
}

module.exports = { buildRevealCommand };
