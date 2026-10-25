import type { AppSet, AppGet } from '../appStore.types';
import type {
  ComparisonIds,
  IterationNode,
  IterationBranch,
  IterationView,
  ComparisonMode as IterationComparisonMode,
} from '@/types/iteration';
import type { GenerationJob } from '@/store/appStore.types';
import { computeSettingsDiff } from '@/utils/iterationTreeUtils';

function normalizeComparisonIds(ids: ComparisonIds, nodes: Map<string, IterationNode>): ComparisonIds {
  if (!ids) {
    return null;
  }

  const uniqueIds = ids.filter((id, index, values) => values.indexOf(id) === index && nodes.has(id));
  if (uniqueIds.length === 0) {
    return null;
  }
  if (uniqueIds.length === 1) {
    return [uniqueIds[0]];
  }
  return [uniqueIds[0], uniqueIds[1]];
}

function getNextComparisonIds(current: ComparisonIds, id: string): ComparisonIds {
  if (!current) {
    return [id];
  }

  if (current.includes(id)) {
    const remaining = current.filter((entry) => entry !== id);
    if (remaining.length === 0) {
      return null;
    }
    return [remaining[0]];
  }

  if (current.length === 1) {
    return [current[0], id];
  }

  return [current[1], id];
}

/** How many iteration nodes survive a restart (pinned nodes and ancestors excepted). */
export const PERSISTED_ITERATION_NODE_CAP = 300;

/**
 * Bounds the iteration graph written to storage. Every completed render adds a
 * node (with its full job and a thumbnail URL), so an unbounded graph made each
 * persist write larger for the life of the install.
 *
 * Kept: the `cap` most recent nodes, every pinned node, any explicitly kept id
 * (the active iteration), and every ancestor of a kept node, so a surviving
 * node never loses the path back to its root. childrenIds are trimmed to the
 * survivors, and a branch survives only while one of its nodes does.
 */
export function capIterationGraphForPersist(
  nodes: Map<string, IterationNode>,
  branches: IterationBranch[],
  options: { cap?: number; keepIds?: (string | null | undefined)[] } = {},
): { nodes: Map<string, IterationNode>; branches: IterationBranch[] } {
  const cap = options.cap ?? PERSISTED_ITERATION_NODE_CAP;
  if (nodes.size <= cap) return { nodes, branches };

  const keep = new Set<string>();
  const sorted = Array.from(nodes.values()).sort((a, b) => b.createdAt - a.createdAt);
  for (const node of sorted.slice(0, cap)) keep.add(node.id);
  for (const node of sorted) if (node.isPinned) keep.add(node.id);
  for (const id of options.keepIds ?? []) if (id && nodes.has(id)) keep.add(id);

  for (const id of Array.from(keep)) {
    let parentId = nodes.get(id)?.parentId ?? null;
    while (parentId && !keep.has(parentId) && nodes.has(parentId)) {
      keep.add(parentId);
      parentId = nodes.get(parentId)?.parentId ?? null;
    }
  }

  const kept = new Map<string, IterationNode>();
  for (const [id, node] of nodes) {
    if (!keep.has(id)) continue;
    const childrenIds = node.childrenIds.filter((childId) => keep.has(childId));
    kept.set(id, childrenIds.length === node.childrenIds.length ? node : { ...node, childrenIds });
  }

  const liveBranchIds = new Set(Array.from(kept.values(), (node) => node.branchId));
  const keptBranches = branches
    .filter((branch) => liveBranchIds.has(branch.id))
    .map((branch) => {
      if (kept.has(branch.activeNodeId)) return branch;
      const newest = sorted.find((node) => node.branchId === branch.id && kept.has(node.id));
      return newest ? { ...branch, activeNodeId: newest.id } : branch;
    });

  return { nodes: kept, branches: keptBranches };
}

export const iterationInitialState = {
  iterationNodes: new Map<string, IterationNode>(),
  iterationBranches: [] as IterationBranch[],
  activeIterationId: null as string | null,
  iterationView: 'panel' as IterationView,
  iterationComparisonMode: 'side-by-side' as IterationComparisonMode,
  comparisonIds: null as ComparisonIds,
  /**
   * The iteration the *next* generation descends from, set when the user forks
   * or re-rolls from a node. Consumed by the first generation that completes
   * afterwards, so an unrelated run started later still records as a root.
   */
  pendingIterationParentId: null as string | null,
  /** Whether that next generation should open its own branch. */
  pendingIterationNewBranch: false,
};

export function createIterationActions(set: AppSet, get: AppGet) {
  return {
    addIteration: (params: { job: GenerationJob; parentId: string | null; thumbnail: string; branchId?: string }) => {
      const { job, thumbnail, branchId } = params;
      const nodes = get().iterationNodes;
      const branches = get().iterationBranches;

      // Tree integrity: a node can never be its own parent, and a parent that
      // names no existing node is no parent at all. Either would produce a
      // cycle or a dangling edge that makes the tree unwalkable.
      const parentId =
        params.parentId && params.parentId !== job.id && nodes.has(params.parentId)
          ? params.parentId
          : null;

      const parentNode = parentId ? nodes.get(parentId) : undefined;
      const settingsDiff = parentNode
        ? computeSettingsDiff(parentNode.generationJob.params, job.params)
        : null;

      let targetBranchId = branchId;
      if (!targetBranchId) {
        if (parentNode) {
          targetBranchId = parentNode.branchId;
        } else {
          targetBranchId = crypto.randomUUID();
        }
      }

      const node: IterationNode = {
        id: job.id,
        parentId,
        branchId: targetBranchId,
        childrenIds: [],
        generationJob: job,
        thumbnail,
        settingsDiff,
        createdAt: Date.now(),
        isPinned: false,
        note: '',
      };

      const newNodes = new Map(nodes);
      newNodes.set(job.id, node);

      if (parentId) {
        const existingParent = newNodes.get(parentId);
        if (existingParent) {
          newNodes.set(parentId, { ...existingParent, childrenIds: [...existingParent.childrenIds, job.id] });
        }
      }

      let newBranches = [...branches];
      if (!newBranches.some(b => b.id === targetBranchId)) {
        newBranches.push({
          id: targetBranchId,
          name: `Branch ${newBranches.length + 1}`,
          rootNodeId: parentId ?? job.id,
          activeNodeId: job.id,
          createdAt: Date.now(),
        });
      } else {
        newBranches = newBranches.map(b =>
          b.id === targetBranchId ? { ...b, activeNodeId: job.id } : b
        );
      }

      set({
        iterationNodes: newNodes,
        iterationBranches: newBranches,
        activeIterationId: job.id,
      });
    },

    /**
     * Record which iteration the next generation descends from. This does not
     * create a node: a node represents a render that actually happened, so it
     * is minted only when a real job completes.
     */
    setPendingIterationParent: (
      parentId: string | null,
      options?: { newBranch?: boolean },
    ) =>
      set({
        pendingIterationParentId: parentId,
        pendingIterationNewBranch: options?.newBranch ?? false,
      }),

    clearPendingIterationParent: () =>
      set({ pendingIterationParentId: null, pendingIterationNewBranch: false }),

    pinIteration: (id: string) => {
      const nodes = get().iterationNodes;
      const node = nodes.get(id);
      if (!node) return;
      const newNodes = new Map(nodes);
      newNodes.set(id, { ...node, isPinned: !node.isPinned });
      set({ iterationNodes: newNodes });
    },

    setIterationNote: (id: string, note: string) => {
      const nodes = get().iterationNodes;
      const node = nodes.get(id);
      if (!node) return;
      const newNodes = new Map(nodes);
      newNodes.set(id, { ...node, note });
      set({ iterationNodes: newNodes });
    },

    setActiveIteration: (id: string | null) => set({ activeIterationId: id }),
    setIterationView: (view: IterationView) => set({ iterationView: view }),
    setIterationComparisonMode: (mode: IterationComparisonMode) => set({ iterationComparisonMode: mode }),
    setComparisonIds: (ids: ComparisonIds) =>
      set((state) => ({
        comparisonIds: normalizeComparisonIds(ids, state.iterationNodes),
      })),
    toggleIterationComparison: (id: string) =>
      set((state) => ({
        comparisonIds: normalizeComparisonIds(
          getNextComparisonIds(state.comparisonIds, id),
          state.iterationNodes,
        ),
      })),
    swapIterationComparison: () =>
      set((state) => ({
        comparisonIds:
          state.comparisonIds && state.comparisonIds.length === 2
            ? [state.comparisonIds[1], state.comparisonIds[0]]
            : state.comparisonIds,
      })),
    clearIterationComparison: () => set({ comparisonIds: null }),

    deleteIterationBranch: (branchId: string) => {
      const branches = get().iterationBranches.filter(b => b.id !== branchId);
      const branchNodeIds = new Set<string>();
      get().iterationNodes.forEach((node) => {
        if (node.branchId === branchId) branchNodeIds.add(node.id);
      });
      const newNodes = new Map(get().iterationNodes);
      for (const id of branchNodeIds) newNodes.delete(id);
      // Clean up dangling childrenIds references in remaining nodes
      for (const [nodeId, node] of newNodes) {
        const cleaned = node.childrenIds.filter(cid => !branchNodeIds.has(cid));
        if (cleaned.length !== node.childrenIds.length) {
          newNodes.set(nodeId, { ...node, childrenIds: cleaned });
        }
      }
      set((state) => ({
        iterationBranches: branches,
        iterationNodes: newNodes,
        comparisonIds: normalizeComparisonIds(state.comparisonIds, newNodes),
      }));
    },
  };
}
