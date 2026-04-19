import { describe, expect, it } from 'vitest';
import { buildTree, getPath, getSiblings, computeSettingsDiff } from './iterationTreeUtils';
import type { IterationNode, IterationBranch } from '@/types/iteration';

const makeNode = (id: string, parentId: string | null, branchId: string, children: string[] = []): IterationNode => ({
  id,
  parentId,
  branchId,
  childrenIds: children,
  generationJob: { id, type: 'image', status: 'completed', progress: 100, params: {}, createdAt: new Date() },
  thumbnail: '',
  settingsDiff: null,
  createdAt: Date.now(),
  isPinned: false,
  note: '',
});

describe('iterationTreeUtils', () => {
  describe('buildTree', () => {
    it('builds a tree from flat nodes', () => {
      const nodes = new Map<string, IterationNode>();
      const n1 = makeNode('1', null, 'b1');
      const n2 = makeNode('2', '1', 'b1');
      nodes.set('1', { ...n1, childrenIds: ['2'] });
      nodes.set('2', n2);
      const branches: IterationBranch[] = [{ id: 'b1', name: 'Branch 1', rootNodeId: '1', activeNodeId: '2', createdAt: Date.now() }];

      const tree = buildTree(nodes, branches);
      expect(tree.roots).toHaveLength(1);
      expect(tree.roots[0].id).toBe('1');
    });

    it('finds a node by id', () => {
      const nodes = new Map<string, IterationNode>();
      nodes.set('1', makeNode('1', null, 'b1'));
      const tree = buildTree(nodes, []);
      expect(tree.getNode('1')).toBeDefined();
      expect(tree.getNode('999')).toBeUndefined();
    });
  });

  describe('getPath', () => {
    it('returns path from root to node', () => {
      const nodes = new Map<string, IterationNode>();
      nodes.set('1', { ...makeNode('1', null, 'b1'), childrenIds: ['2'] });
      nodes.set('2', makeNode('2', '1', 'b1'));
      const tree = buildTree(nodes, []);
      const path = tree.getPath('2');
      expect(path).toHaveLength(2);
      expect(path[0].id).toBe('1');
      expect(path[1].id).toBe('2');
    });
  });

  describe('getSiblings', () => {
    it('returns nodes with the same parent', () => {
      const nodes = new Map<string, IterationNode>();
      nodes.set('1', { ...makeNode('1', null, 'b1'), childrenIds: ['2', '3'] });
      nodes.set('2', makeNode('2', '1', 'b1'));
      nodes.set('3', makeNode('3', '1', 'b1'));
      const tree = buildTree(nodes, []);
      const siblings = tree.getSiblings('2');
      expect(siblings).toHaveLength(2);
    });
  });

  describe('computeSettingsDiff', () => {
    it('detects changed fields', () => {
      const diff = computeSettingsDiff(
        { prompt: 'a', steps: 20 },
        { prompt: 'b', steps: 20 },
      );
      expect(diff?.prompt).toBe('b');
      expect(diff?.steps).toBeUndefined();
    });

    it('returns null when nothing changed', () => {
      const diff = computeSettingsDiff(
        { prompt: 'a', steps: 20 },
        { prompt: 'a', steps: 20 },
      );
      expect(diff).toBeNull();
    });
  });
});