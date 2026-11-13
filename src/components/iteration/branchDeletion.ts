import type { IterationBranch, IterationNode } from '@/types/iteration';

export interface BranchDeletionPlan {
  /** Branch ids to delete, dependents first, the requested branch last. */
  branchIds: string[];
  /** Iterations removed across every branch in the plan. */
  nodeCount: number;
}

/**
 * Plans the removal of one iteration branch.
 *
 * A branch forked from another one keeps its first node's parentId pointing at
 * a node on the source branch. Deleting the source branch alone would leave
 * that fork with a dangling parent, so it would drop out of the tree (the tree
 * only roots nodes whose parentId is null) while its iterations stayed in the
 * store. Every branch that descends from the deleted one is therefore removed
 * with it, and the confirm dialog says so.
 */
export function planBranchDeletion(
  branchId: string,
  nodes: Map<string, IterationNode>,
  branches: IterationBranch[],
): BranchDeletionPlan {
  const doomedBranches = new Set<string>([branchId]);
  const doomedNodes = new Set<string>();
  const ordered: string[] = [];

  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes.values()) {
      if (doomedBranches.has(node.branchId)) doomedNodes.add(node.id);
    }
    for (const branch of branches) {
      if (doomedBranches.has(branch.id)) continue;
      const dependsOnDoomed = Array.from(nodes.values()).some(
        (node) => node.branchId === branch.id && node.parentId !== null && doomedNodes.has(node.parentId),
      );
      if (dependsOnDoomed) {
        doomedBranches.add(branch.id);
        ordered.unshift(branch.id);
        grew = true;
      }
    }
  }

  for (const node of nodes.values()) {
    if (doomedBranches.has(node.branchId)) doomedNodes.add(node.id);
  }

  return { branchIds: [...ordered, branchId], nodeCount: doomedNodes.size };
}
