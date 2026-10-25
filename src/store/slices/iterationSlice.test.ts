import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { GenerationJob } from '@/store/appStore.types';
import type { IterationNode } from '@/types/iteration';
import { capIterationGraphForPersist, PERSISTED_ITERATION_NODE_CAP } from './iterationSlice';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function makeJob(id: string, params: Record<string, unknown> = {}): GenerationJob {
  return {
    id,
    type: 'image',
    status: 'completed',
    progress: 100,
    params: { prompt: 'a cinematic portrait', seed: 42, ...params },
    result: { images: [`file:///C:/out/${id}.png`] },
    createdAt: new Date(),
  } as GenerationJob;
}

describe('iteration tree integrity', () => {
  beforeEach(resetStore);

  it('refuses to make a node its own parent', () => {
    const job = makeJob('job-1');
    useAppStore.getState().addIteration({ job, parentId: null, thumbnail: 't.png' });

    // Re-adding the same job while naming itself as parent must not create a
    // self-referential node - that cycle makes the tree unwalkable.
    useAppStore.getState().addIteration({ job, parentId: job.id, thumbnail: 't.png' });

    const node = useAppStore.getState().iterationNodes.get('job-1')!;
    expect(node.parentId).toBeNull();
    expect(node.childrenIds).not.toContain('job-1');
  });

  it('ignores a parent id that names no existing node', () => {
    useAppStore.getState().addIteration({
      job: makeJob('job-1'),
      parentId: 'ghost',
      thumbnail: 't.png',
    });

    expect(useAppStore.getState().iterationNodes.get('job-1')!.parentId).toBeNull();
  });

  it('links a genuine child to its parent in both directions', () => {
    useAppStore.getState().addIteration({
      job: makeJob('job-1'),
      parentId: null,
      thumbnail: 'a.png',
    });
    useAppStore.getState().addIteration({
      job: makeJob('job-2'),
      parentId: 'job-1',
      thumbnail: 'b.png',
    });

    const nodes = useAppStore.getState().iterationNodes;
    expect(nodes.get('job-2')!.parentId).toBe('job-1');
    expect(nodes.get('job-1')!.childrenIds).toEqual(['job-2']);
  });
});

describe('iteration lineage from real generations', () => {
  beforeEach(resetStore);

  it('roots a generation that was not derived from an iteration', () => {
    const job = makeJob('job-1');
    useAppStore.getState().addJob({ ...job, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-1', { status: 'completed', result: job.result });

    expect(useAppStore.getState().iterationNodes.get('job-1')!.parentId).toBeNull();
  });

  it('attaches a derived generation under the iteration it came from', () => {
    const root = makeJob('job-1');
    useAppStore.getState().addJob({ ...root, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-1', { status: 'completed', result: root.result });

    // The next generation is started from that iteration.
    useAppStore.getState().setPendingIterationParent('job-1', { newBranch: false });
    const child = makeJob('job-2');
    useAppStore.getState().addJob({ ...child, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-2', { status: 'completed', result: child.result });

    const nodes = useAppStore.getState().iterationNodes;
    expect(nodes.get('job-2')!.parentId).toBe('job-1');
    expect(nodes.get('job-1')!.childrenIds).toEqual(['job-2']);
  });

  it('records the settings that actually changed between parent and child', () => {
    const root = makeJob('job-1', { steps: 20 });
    useAppStore.getState().addJob({ ...root, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-1', { status: 'completed', result: root.result });

    useAppStore.getState().setPendingIterationParent('job-1', { newBranch: false });
    const child = makeJob('job-2', { steps: 40 });
    useAppStore.getState().addJob({ ...child, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-2', { status: 'completed', result: child.result });

    expect(useAppStore.getState().iterationNodes.get('job-2')!.settingsDiff).not.toBeNull();
  });

  it('keeps a same-branch child on the parent branch', () => {
    const root = makeJob('job-1');
    useAppStore.getState().addJob({ ...root, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-1', { status: 'completed', result: root.result });

    useAppStore.getState().setPendingIterationParent('job-1', { newBranch: false });
    const child = makeJob('job-2');
    useAppStore.getState().addJob({ ...child, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-2', { status: 'completed', result: child.result });

    const nodes = useAppStore.getState().iterationNodes;
    expect(nodes.get('job-2')!.branchId).toBe(nodes.get('job-1')!.branchId);
  });

  it('opens a new branch when the generation was forked', () => {
    const root = makeJob('job-1');
    useAppStore.getState().addJob({ ...root, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-1', { status: 'completed', result: root.result });

    useAppStore.getState().setPendingIterationParent('job-1', { newBranch: true });
    const child = makeJob('job-2');
    useAppStore.getState().addJob({ ...child, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-2', { status: 'completed', result: child.result });

    const nodes = useAppStore.getState().iterationNodes;
    expect(nodes.get('job-2')!.branchId).not.toBe(nodes.get('job-1')!.branchId);
    expect(useAppStore.getState().iterationBranches).toHaveLength(2);
  });

  it('consumes the pending parent so the next unrelated run is a root', () => {
    const root = makeJob('job-1');
    useAppStore.getState().addJob({ ...root, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-1', { status: 'completed', result: root.result });

    useAppStore.getState().setPendingIterationParent('job-1', { newBranch: false });
    const child = makeJob('job-2');
    useAppStore.getState().addJob({ ...child, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-2', { status: 'completed', result: child.result });

    const third = makeJob('job-3');
    useAppStore.getState().addJob({ ...third, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-3', { status: 'completed', result: third.result });

    expect(useAppStore.getState().iterationNodes.get('job-3')!.parentId).toBeNull();
  });

  it('never attaches a timeline-sourced job to the iteration tree', () => {
    const job = makeJob('job-1', { source: 'timeline' });
    useAppStore.getState().addJob({ ...job, status: 'pending', progress: 0 });
    useAppStore.getState().updateJob('job-1', { status: 'completed', result: job.result });

    expect(useAppStore.getState().iterationNodes.size).toBe(0);
  });
});

describe('persisted iteration graph cap', () => {
  beforeEach(resetStore);

  function makeNode(id: string, createdAt: number, extra: Partial<IterationNode> = {}): IterationNode {
    return {
      id,
      parentId: null,
      branchId: 'b1',
      childrenIds: [],
      generationJob: makeJob(id),
      thumbnail: '',
      settingsDiff: null,
      createdAt,
      isPinned: false,
      note: '',
      ...extra,
    };
  }

  it('returns the graph unchanged while it is under the cap', () => {
    const nodes = new Map([['a', makeNode('a', 1)]]);
    const result = capIterationGraphForPersist(nodes, [], { cap: 5 });
    expect(result.nodes).toBe(nodes);
  });

  it('keeps the newest nodes, pinned nodes and every ancestor of a kept node', () => {
    const nodes = new Map<string, IterationNode>([
      ['root', makeNode('root', 1, { childrenIds: ['mid', 'old'] })],
      ['mid', makeNode('mid', 2, { parentId: 'root', childrenIds: ['leaf'] })],
      ['old', makeNode('old', 3, { parentId: 'root' })],
      ['pinned', makeNode('pinned', 4, { isPinned: true, branchId: 'b2' })],
      ['other', makeNode('other', 5, { branchId: 'b3' })],
      ['leaf', makeNode('leaf', 10, { parentId: 'mid' })],
    ]);
    const branches = [
      { id: 'b1', name: 'B1', rootNodeId: 'root', activeNodeId: 'old', createdAt: 1 },
      { id: 'b2', name: 'B2', rootNodeId: 'pinned', activeNodeId: 'pinned', createdAt: 4 },
      { id: 'b3', name: 'B3', rootNodeId: 'other', activeNodeId: 'other', createdAt: 5 },
    ];

    const result = capIterationGraphForPersist(nodes, branches, { cap: 1 });

    expect([...result.nodes.keys()].sort()).toEqual(['leaf', 'mid', 'pinned', 'root']);
    expect(result.nodes.get('root')!.childrenIds).toEqual(['mid']);
    expect(result.branches.map((branch) => branch.id)).toEqual(['b1', 'b2']);
    expect(result.branches[0].activeNodeId).toBe('leaf');
  });

  it('caps what partialize writes', () => {
    const partialize = (useAppStore as unknown as {
      persist: { getOptions: () => { partialize: (s: unknown) => Record<string, unknown> } };
    }).persist.getOptions().partialize;
    const nodes = new Map<string, IterationNode>();
    for (let i = 0; i < PERSISTED_ITERATION_NODE_CAP + 25; i++) {
      nodes.set(`n${i}`, makeNode(`n${i}`, i, { branchId: `b${i}` }));
    }
    useAppStore.setState({ iterationNodes: nodes });

    const persisted = partialize(useAppStore.getState());
    expect((persisted.iterationNodes as unknown[]).length).toBe(PERSISTED_ITERATION_NODE_CAP);
  });
});
