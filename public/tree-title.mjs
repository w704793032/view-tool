function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function formatModifiedTime(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return [
    d.getFullYear(),
    pad2(d.getMonth() + 1),
    pad2(d.getDate()),
  ].join('-') + ' ' + [
    pad2(d.getHours()),
    pad2(d.getMinutes()),
    pad2(d.getSeconds()),
  ].join(':');
}

export function buildTreeTitle(name, info = {}) {
  const modified = formatModifiedTime(info.mtimeMs);
  if (!modified) return name;

  const lines = [
    name,
    `修改时间：${modified}`,
  ];
  if (info.type === 'file' && info.size != null) {
    lines.push(`大小：${formatBytes(info.size)}`);
  }
  return lines.join('\n');
}
