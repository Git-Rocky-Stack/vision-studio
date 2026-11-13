import { describe, expect, it } from 'vitest';
import type { IterationBranch, IterationNode } from '@/types/iteration';
import { planBranchDeletion } from './branchDeletion';

function node(id: string, branchId: string, parentId: string | null): IterationNode {
  return { id, branchId, parentId, childrenIds: [] } as unknown as IterationNode;
}

function branch(id: string, rootNodeId: string): IterationBranch {
  return { id, name: id, rootNodeId, activeNodeId: rootNodeId, createdAt: 0 };
}

describe('planBranchDeletion', () => {
  const nodes = new Map<string, IterationNode>([
    ['a1', node('a1', 'A', null)],
    ['a2', node('a2', 'A', 'a1')],
    ['b1', node('b1', 'B', 'a2')],
    ['c1', node('c1', 'C', 'b1')],
    ['d1', node('d1', 'D', 'a1')],
  ]);
  const branches = [branch('A', 'a1'), branch('B', 'b1'), branch('C', 'c1'), branch('D', 'd1')];

  it('removes a leaf branch on its own', () => {
    expect(planBranchDeletion('C', nodes, branches)).toEqual({ branchIds: ['C'], nodeCount: 1 });
  });

  it('cascades to every branch forked from the deleted one, deepest first', () => {
    const plan = planBranchDeletion('B', nodes, branches);
    expect(plan.branchIds).toEqual(['C', 'B']);
    expect(plan.nodeCount).toBe(2);
  });

  it('removes the whole history when the root branch goes', () => {
    const plan = planBranchDeletion('A', nodes, branches);
    expect(plan.branchIds[plan.branchIds.length - 1]).toBe('A');
    expect(new Set(plan.branchIds)).toEqual(new Set(['A', 'B', 'C', 'D']));
    expect(plan.nodeCount).toBe(5);
  });
});
