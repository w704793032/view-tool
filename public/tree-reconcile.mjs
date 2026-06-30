function joinPath(base, child) {
  if (!base || base === '.') return child;
  return `${base}/${child}`;
}

export function toTreeEntryInfo(parentPath, entry) {
  return {
    ...entry,
    fullPath: joinPath(parentPath, entry.name),
  };
}

export function canReuseTreeNode(existingInfo, nextInfo) {
  return existingInfo?.fullPath === nextInfo?.fullPath
    && existingInfo?.type === nextInfo?.type;
}

export function getDirectTreeNodes(container) {
  return Array.from(container?.children || [])
    .filter((child) => child.classList?.contains('tree-node'));
}
