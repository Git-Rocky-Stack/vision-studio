import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowGraph } from '@/types/workflow';
import { VIEWPORT_SETTLE_MS, WorkflowGraphEditor } from './WorkflowGraphEditor';

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
    model: {
      id: 'model',
      classType: 'CheckpointLoaderSimple',
      label: 'Model Loader',
      position: { x: 40, y: 220 },
      inputs: {
        ckpt_name: { kind: 'literal', value: 'flux-dev.safetensors' },
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
    const { container } = render(
      <WorkflowGraphEditor
        graph={graph}
        onMoveNode={() => {}}
        onAddNode={() => {}}
        onConnectNodes={() => {}}
        onDeleteSelection={() => {}}
      />
    );

    expect(screen.getByRole('region', { name: 'Workflow graph editor' })).toBeInTheDocument();
    expect(
      container.querySelector('svg[aria-label="Workflow graph with 3 nodes and 1 connection"]')
    ).toBeInTheDocument();
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

  it('connects model outputs to the sampler model input', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Model Loader node' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start connection from selected node' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sampler node' }));

    expect(onConnectNodes).toHaveBeenCalledWith({
      sourceNodeId: 'model',
      sourceOutput: 'MODEL',
      targetNodeId: 'sampler',
      targetInput: 'model',
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

  it('moves a node with arrow keys', () => {
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

    fireEvent.keyDown(screen.getByRole('button', { name: 'Prompt Encode node' }), {
      key: 'ArrowRight',
    });

    expect(onMoveNode).toHaveBeenCalledWith('prompt', { x: 56, y: 80 });
  });

  it('previews node movement while dragging', () => {
    render(
      <WorkflowGraphEditor
        graph={graph}
        onMoveNode={() => {}}
        onAddNode={() => {}}
        onConnectNodes={() => {}}
        onDeleteSelection={() => {}}
      />
    );

    const node = screen.getByRole('button', { name: 'Prompt Encode node' });
    fireEvent.pointerDown(node, { clientX: 50, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 90, clientY: 120, pointerId: 1 });

    expect(node).toHaveStyle({ left: '80px', top: '110px' });
  });

  it('clears selection after deleting a selected node', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Delete selection' }));

    expect(screen.getByRole('button', { name: 'Delete selection' })).toBeDisabled();
  });

  describe('LoRA Loader inspector (#43)', () => {
    const loraGraph: WorkflowGraph = {
      nodes: {
        ...graph.nodes,
        'lora-1': {
          id: 'lora-1',
          classType: 'LoraLoader',
          label: 'LoRA Loader',
          position: { x: 200, y: 220 },
          inputs: {
            model: { kind: 'link', nodeId: 'model', output: 'MODEL' },
            lora_name: { kind: 'literal', value: 'flux-ink.safetensors' },
            strength_model: { kind: 'literal', value: 0.8 },
          },
        },
      },
      edges: graph.edges,
    };

    const loraOptions = [
      { value: 'flux-ink.safetensors', label: 'Flux Ink', compatible: true },
      { value: 'detail-tweaker-xl.safetensors', label: 'Detail Tweaker', compatible: false },
    ];

    function renderLoraEditor(onUpdateNodeInput = vi.fn()) {
      render(
        <WorkflowGraphEditor
          graph={loraGraph}
          onMoveNode={() => {}}
          onAddNode={() => {}}
          onConnectNodes={() => {}}
          onDeleteSelection={() => {}}
          loraOptions={loraOptions}
          onUpdateNodeInput={onUpdateNodeInput}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'LoRA Loader node' }));
      return onUpdateNodeInput;
    }

    it('offers the installed-LoRA library with the current selection applied', () => {
      renderLoraEditor();

      const select = screen.getByLabelText('LoRA selection') as HTMLSelectElement;
      expect(select.value).toBe('flux-ink.safetensors');
      const optionLabels = Array.from(select.options).map((option) => option.textContent);
      expect(optionLabels).toContain('Flux Ink');
      expect(optionLabels.some((label) => label?.startsWith('Detail Tweaker'))).toBe(true);
    });

    it('disables base-architecture-incompatible LoRAs', () => {
      renderLoraEditor();

      const select = screen.getByLabelText('LoRA selection') as HTMLSelectElement;
      const incompatible = Array.from(select.options).find(
        (option) => option.value === 'detail-tweaker-xl.safetensors',
      );
      expect(incompatible?.disabled).toBe(true);
    });

    it('writes the selection through onUpdateNodeInput', () => {
      const onUpdateNodeInput = renderLoraEditor();

      fireEvent.change(screen.getByLabelText('LoRA selection'), {
        target: { value: 'flux-ink.safetensors' },
      });

      expect(onUpdateNodeInput).toHaveBeenCalledWith('lora-1', 'lora_name', 'flux-ink.safetensors');
    });

    it('writes the model strength through onUpdateNodeInput as a number', () => {
      const onUpdateNodeInput = renderLoraEditor();

      fireEvent.change(screen.getByLabelText('LoRA model strength'), {
        target: { value: '1.25' },
      });

      expect(onUpdateNodeInput).toHaveBeenCalledWith('lora-1', 'strength_model', 1.25);
    });

    it('explains the empty state when no LoRAs are installed', () => {
      render(
        <WorkflowGraphEditor
          graph={loraGraph}
          onMoveNode={() => {}}
          onAddNode={() => {}}
          onConnectNodes={() => {}}
          onDeleteSelection={() => {}}
          loraOptions={[]}
          onUpdateNodeInput={() => {}}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'LoRA Loader node' }));

      expect(screen.getByText(/no loras installed/i)).toBeInTheDocument();
    });
  });

  describe('viewport (pan and zoom)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    function renderEditor(props: Partial<React.ComponentProps<typeof WorkflowGraphEditor>> = {}) {
      return render(
        <WorkflowGraphEditor
          graph={graph}
          onMoveNode={() => {}}
          onAddNode={() => {}}
          onConnectNodes={() => {}}
          onDeleteSelection={() => {}}
          {...props}
        />
      );
    }

    it('restores the saved pan and zoom on mount', () => {
      renderEditor({ graph: { ...graph, viewport: { x: 120, y: 60, zoom: 1.5 } } });

      const viewport = screen.getByTestId('workflow-graph-viewport');
      expect(viewport.scrollLeft).toBe(120);
      expect(viewport.scrollTop).toBe(60);
      expect(screen.getByLabelText('Graph zoom level')).toHaveTextContent('150%');
      expect(screen.getByTestId('workflow-graph-canvas')).toHaveStyle({ transform: 'scale(1.5)' });
    });

    it('saves the pan once scrolling settles, not on every scroll event', () => {
      vi.useFakeTimers();
      const onViewportChange = vi.fn();
      renderEditor({ onViewportChange });

      const viewport = screen.getByTestId('workflow-graph-viewport');
      viewport.scrollLeft = 40;
      fireEvent.scroll(viewport);
      viewport.scrollLeft = 90;
      viewport.scrollTop = 30;
      fireEvent.scroll(viewport);
      expect(onViewportChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(VIEWPORT_SETTLE_MS);
      expect(onViewportChange).toHaveBeenCalledTimes(1);
      expect(onViewportChange).toHaveBeenCalledWith({ x: 90, y: 30, zoom: 1 });

      // An unchanged position is not written again.
      fireEvent.scroll(viewport);
      vi.advanceTimersByTime(VIEWPORT_SETTLE_MS);
      expect(onViewportChange).toHaveBeenCalledTimes(1);
    });

    it('zooms with the toolbar within bounds and saves the zoom', () => {
      vi.useFakeTimers();
      const onViewportChange = vi.fn();
      renderEditor({ onViewportChange, graph: { ...graph, viewport: { x: 0, y: 0, zoom: 1.9 } } });

      fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
      expect(screen.getByLabelText('Graph zoom level')).toHaveTextContent('200%');
      expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();

      vi.advanceTimersByTime(VIEWPORT_SETTLE_MS);
      expect(onViewportChange).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 2 }));

      fireEvent.click(screen.getByRole('button', { name: 'Reset graph view' }));
      vi.advanceTimersByTime(VIEWPORT_SETTLE_MS);
      expect(onViewportChange).toHaveBeenLastCalledWith({ x: 0, y: 0, zoom: 1 });
      expect(screen.getByLabelText('Graph zoom level')).toHaveTextContent('100%');
    });

    it('zooms with Ctrl + wheel', () => {
      renderEditor();
      fireEvent.wheel(screen.getByTestId('workflow-graph-viewport'), { deltaY: -100, ctrlKey: true });
      expect(screen.getByLabelText('Graph zoom level')).toHaveTextContent('110%');
    });

    it('flushes a still-settling gesture when the editor unmounts', () => {
      vi.useFakeTimers();
      const onViewportChange = vi.fn();
      const { unmount } = renderEditor({ onViewportChange });
      const viewport = screen.getByTestId('workflow-graph-viewport');
      viewport.scrollTop = 75;
      fireEvent.scroll(viewport);

      unmount();
      expect(onViewportChange).toHaveBeenCalledWith({ x: 0, y: 75, zoom: 1 });
    });

    it('converts drag distance into graph units while zoomed', () => {
      const onMoveNode = vi.fn();
      renderEditor({ onMoveNode, graph: { ...graph, viewport: { x: 0, y: 0, zoom: 2 } } });

      const node = screen.getByRole('button', { name: 'Prompt Encode node' });
      fireEvent.pointerDown(node, { clientX: 50, clientY: 90, pointerId: 1 });
      fireEvent.pointerUp(window, { clientX: 90, clientY: 130, pointerId: 1 });

      expect(onMoveNode).toHaveBeenCalledWith('prompt', { x: 60, y: 100 });
    });
  });
});
