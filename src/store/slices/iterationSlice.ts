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

export const iterationInitialState = {
  iterationNodes: new Map<string, IterationNode>(),
  iterationBranches: [] as IterationBranch[],
  activeIterationId: null as string | null,
  iterationView: 'panel' as IterationView,
  iterationComparisonMode: 'side-by-side' as IterationComparisonMode,
  comparisonIds: null as ComparisonIds,
};

export function createIterationActions(set: AppSet, get: AppGet) {
  return {
    addIteration: (params: { job: GenerationJob; parentId: string | null; thumbnail: string; branchId?: string }) => {
      const { job, parentId, thumbnail, branchId } = params;
      const nodes = get().iterationNodes;
      const branches = get().iterationBranches;

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

    forkIteration: (params: { job: GenerationJob; parentId: string; thumbnail: string }) => {
      const { job, parentId, thumbnail } = params;
      const newBranchId = crypto.randomUUID();
      get().addIteration({ job, parentId, thumbnail, branchId: newBranchId });
    },

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
