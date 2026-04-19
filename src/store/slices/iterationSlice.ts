import type { AppSet, AppGet } from '../appStore.types';
import type { IterationNode, IterationBranch, IterationView, ComparisonMode as IterationComparisonMode, SettingsDiff } from '@/types/iteration';
import type { GenerationJob } from '@/store/appStore.types';

export const iterationInitialState = {
  iterationNodes: new Map<string, IterationNode>(),
  iterationBranches: [] as IterationBranch[],
  activeIterationId: null as string | null,
  iterationView: 'panel' as IterationView,
  iterationComparisonMode: 'side-by-side' as IterationComparisonMode,
  comparisonIds: null as [string, string] | null,
};

function computeSettingsDiff(
  parent: GenerationJob['params'],
  child: GenerationJob['params'],
): SettingsDiff | null {
  const diff: SettingsDiff = {};
  const keys = Object.keys(child) as (keyof typeof child)[];
  for (const key of keys) {
    if (child[key] !== parent[key]) {
      (diff as Record<string, unknown>)[key] = child[key];
    }
  }
  return Object.keys(diff).length > 0 ? diff : null;
}

export function createIterationActions(set: AppSet, get: AppGet) {
  return {
    addIteration: (params: { job: GenerationJob; parentId: string | null; thumbnail: string; branchId?: string }) => {
      const { job, parentId, thumbnail, branchId } = params;
      const nodes = get().iterationNodes;
      const branches = get().iterationBranches;

      const settingsDiff = parentId && nodes.has(parentId)
        ? computeSettingsDiff(nodes.get(parentId)!.generationJob.params, job.params)
        : null;

      let targetBranchId = branchId;
      if (!targetBranchId) {
        if (parentId && nodes.has(parentId)) {
          targetBranchId = nodes.get(parentId)!.branchId;
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

      if (parentId && newNodes.has(parentId)) {
        const parent = newNodes.get(parentId)!;
        newNodes.set(parentId, { ...parent, childrenIds: [...parent.childrenIds, job.id] });
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
    setComparisonIds: (ids: [string, string] | null) => set({ comparisonIds: ids }),

    deleteIterationBranch: (branchId: string) => {
      const branches = get().iterationBranches.filter(b => b.id !== branchId);
      const branchNodeIds = new Set<string>();
      get().iterationNodes.forEach((node) => {
        if (node.branchId === branchId) branchNodeIds.add(node.id);
      });
      const newNodes = new Map(get().iterationNodes);
      for (const id of branchNodeIds) newNodes.delete(id);
      set({ iterationBranches: branches, iterationNodes: newNodes });
    },
  };
}