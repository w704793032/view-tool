'use strict';

const { version } = require('../package.json');

/** 构建时从 package.json 读取，SEA 打包时由 esbuild 内联。 */
const APP_VERSION = version;

module.exports = { APP_VERSION };
