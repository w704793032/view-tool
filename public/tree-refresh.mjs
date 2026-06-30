export const TREE_REFRESH_INTERVAL_MS = 5000;

export function getTreeRefreshPaths(expandedDirs) {
  const paths = ['.'];
  const seen = new Set(paths);

  for (const path of expandedDirs || []) {
    if (typeof path !== 'string' || path.length === 0 || seen.has(path)) continue;
    paths.push(path);
    seen.add(path);
  }

  return paths;
}
