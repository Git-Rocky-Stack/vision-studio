import type { IterationNode, IterationBranch, IterationTree, SettingsDiff } from '@/types/iteration';

export function buildTree(
  nodes: Map<string, IterationNode>,
  branches: IterationBranch[],
): IterationTree {
  const roots = Array.from(nodes.values()).filter(n => n.parentId === null);

  return {
    roots,
    branches,
    getNode: (id: string) => nodes.get(id),
    getPath: (id: string) => {
      const path: IterationNode[] = [];
      let current = nodes.get(id);
      while (current) {
        path.unshift(current);
        current = current.parentId ? nodes.get(current.parentId) : undefined;
      }
      return path;
    },
    getSiblings: (id: string) => {
      const node = nodes.get(id);
      if (!node || !node.parentId) return roots;
      const parent = nodes.get(node.parentId);
      return parent
        ? parent.childrenIds.map(cid => nodes.get(cid)!).filter(Boolean)
        : roots;
    },
  };
}

export function computeSettingsDiff(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
): SettingsDiff | null {
  const diff: SettingsDiff = {};
  const allKeys = new Set([...Object.keys(parent), ...Object.keys(child)]);
  for (const key of allKeys) {
    if (child[key] !== parent[key]) {
      (diff as Record<string, unknown>)[key] = child[key];
    }
  }
  return Object.keys(diff).length > 0 ? diff : null;
}