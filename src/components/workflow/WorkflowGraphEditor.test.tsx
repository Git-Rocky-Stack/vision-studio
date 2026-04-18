import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowGraph } from '@/store/appStore';
import { WorkflowGraphEditor } from './WorkflowGraphEditor';

const graph: WorkflowGraph = {
  nodes: {
    prompt: {
      id: 'prompt',
      classType: 'CLIPTextEncode',
      label: 'Prompt Encode',
      position: { x: 40, y: 80 },
      inputs: {
        text: { kind: 'literal', value: 'test prompt' },
      },
    },
    sampler: {
      id: 'sampler',
      classType: 'KSampler',
      label: 'Sampler',
      position: { x: 320, y: 80 },
      inputs: {
        positive: { kind: 'link', nodeId: 'prompt', output: 'CONDITIONING' },
      },
    },
  },
  edges: [
    {
      id: 'edge-prompt-sampler-positive',
      sourceNodeId: 'prompt',
      sourceOutput: 'CONDITIONING',
      targetNodeId: 'sampler',
      targetInput: 'positive',
    },
  ],
};

describe('WorkflowGraphEditor', () => {
  afterEach(cleanup);

  it('renders graph nodes and edges', () => {
    render(
      <WorkflowGraphEditor
        graph={graph}
        onMoveNode={() => {}}
        onAddNode={() => {}}
        onConnectNodes={() => {}}
        onDeleteSelection={() => {}}
      />
    );

    expect(screen.getByRole('region', { name: 'Workflow graph editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prompt Encode node' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sampler node' })).toBeInTheDocument();
    expect(screen.getByTestId('workflow-edge-edge-prompt-sampler-positive')).toBeInTheDocument();
  });

  it('selects a node and shows inspector details', () => {
    render(
      <WorkflowGraphEditor
        graph={graph}
        onMoveNode={() => {}}
        onAddNode={() => {}}
        onConnectNodes={() => {}}
        onDeleteSelection={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sampler node' }));

    expect(screen.getByRole('heading', { name: 'Sampler' })).toBeInTheDocument();
    expect(screen.getByText('KSampler')).toBeInTheDocument();
  });

  it('adds a sampler node from the toolbar', () => {
    const onAddNode = vi.fn();
    render(
      <WorkflowGraphEditor
        graph={graph}
        onMoveNode={() => {}}
        onAddNode={onAddNode}
        onConnectNodes={() => {}}
        onDeleteSelection={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Sampler node' }));

    expect(onAddNode).toHaveBeenCalledWith('KSampler');
  });

  it('deletes the selected node', () => {
    const onDeleteSelection = vi.fn();
    render(
      <WorkflowGraphEditor
        graph={graph}
        onMoveNode={() => {}}
        onAddNode={() => {}}
        onConnectNodes={() => {}}
        onDeleteSelection={onDeleteSelection}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sampler node' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selection' }));

    expect(onDeleteSelection).toHaveBeenCalledWith({ type: 'node', id: 'sampler' });
  });

  it('connects selected source and target nodes with default slots', () => {
    const onConnectNodes = vi.fn();
    render(
      <WorkflowGraphEditor
        graph={graph}
        onMoveNode={() => {}}
        onAddNode={() => {}}
        onConnectNodes={onConnectNodes}
        onDeleteSelection={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Prompt Encode node' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start connection from selected node' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sampler node' }));

    expect(onConnectNodes).toHaveBeenCalledWith({
      sourceNodeId: 'prompt',
      sourceOutput: 'CONDITIONING',
      targetNodeId: 'sampler',
      targetInput: 'positive',
    });
  });

  it('moves a node by pointer drag', () => {
    const onMoveNode = vi.fn();
    render(
      <WorkflowGraphEditor
        graph={graph}
        onMoveNode={onMoveNode}
        onAddNode={() => {}}
        onConnectNodes={() => {}}
        onDeleteSelection={() => {}}
      />
    );

    const node = screen.getByRole('button', { name: 'Prompt Encode node' });
    fireEvent.pointerDown(node, { clientX: 50, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 90, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 90, clientY: 120, pointerId: 1 });

    expect(onMoveNode).toHaveBeenCalledWith('prompt', { x: 80, y: 110 });
  });
});
