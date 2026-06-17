'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  rootDir: '',
  port: 3000,
  maxPreviewSize: 5242880,
  version: 1,
};

class ConfigStore {
  constructor(filePath, cliOverrides = {}) {
    this.filePath = filePath;
    this.cliOverrides = cliOverrides;
  }

  load() {
    let fromFile = {};
    try {
      const text = fs.readFileSync(this.filePath, 'utf8');
      fromFile = JSON.parse(text);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        fromFile = {};
      }
    }
    return {
      ...DEFAULTS,
      ...fromFile,
      ...this.cliOverrides,
    };
  }

  save(cfg) {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }
}

module.exports = { ConfigStore, DEFAULTS };
