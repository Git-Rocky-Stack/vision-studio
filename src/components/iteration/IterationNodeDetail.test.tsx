import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { GenerationJob } from '@/store/appStore.types';
import type { IterationNode } from '@/types/iteration';

import { IterationNodeDetail } from './IterationNodeDetail';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function makeJob(id: string, params: Record<string, unknown> = {}): GenerationJob {
  return {
    id,
    type: 'image',
    status: 'completed',
    progress: 100,
    params: {
      prompt: 'a cinematic portrait',
      negative_prompt: 'blurry',
      width: 1024,
      height: 1024,
      steps: 30,
      cfg_scale: 7,
      model: 'sdxl',
      scheduler: 'Euler a',
      seed: 42,
      ...params,
    },
    result: { images: [`file:///C:/out/${id}.png`] },
    createdAt: new Date(),
  } as GenerationJob;
}

/** Seed one completed iteration and return its node. */
function seedNode(): IterationNode {
  const job = makeJob('job-1');
  useAppStore.getState().addIteration({
    job,
    parentId: null,
    thumbnail: 'file:///C:/out/job-1.png',
  });
  return useAppStore.getState().iterationNodes.get('job-1')!;
}

describe('IterationNodeDetail: fork and re-roll', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('does not fabricate a new iteration node when forking', () => {
    const node = seedNode();
    render(<IterationNodeDetail node={node} />);

    fireEvent.click(screen.getByRole('button', { name: /fork from this iteration/i }));

    // A node stands for a render that happened. Forking only says where the
    // next real render attaches.
    expect(useAppStore.getState().iterationNodes.size).toBe(1);
  });

  it('never makes the node its own parent when forking', () => {
    const node = seedNode();
    render(<IterationNodeDetail node={node} />);

    fireEvent.click(screen.getByRole('button', { name: /fork from this iteration/i }));

    const stored = useAppStore.getState().iterationNodes.get('job-1')!;
    expect(stored.parentId).toBeNull();
    expect(stored.childrenIds).not.toContain('job-1');
  });

  it('records the node as the parent of the next generation when forking', () => {
    const node = seedNode();
    render(<IterationNodeDetail node={node} />);

    fireEvent.click(screen.getByRole('button', { name: /fork from this iteration/i }));

    expect(useAppStore.getState().pendingIterationParentId).toBe('job-1');
    expect(useAppStore.getState().pendingIterationNewBranch).toBe(true);
  });

  it('keeps a re-roll on the same branch as its parent', () => {
    const node = seedNode();
    render(<IterationNodeDetail node={node} />);

    fireEvent.click(screen.getByRole('button', { name: /re-roll from this iteration/i }));

    expect(useAppStore.getState().pendingIterationParentId).toBe('job-1');
    expect(useAppStore.getState().pendingIterationNewBranch).toBe(false);
  });

  it('loads the iteration settings into the generator when forking', () => {
    const node = seedNode();
    render(<IterationNodeDetail node={node} />);

    fireEvent.click(screen.getByRole('button', { name: /fork from this iteration/i }));

    const draft = useAppStore.getState().generationDraft;
    expect(draft).not.toBeNull();
    expect(draft!.prompt).toBe('a cinematic portrait');
    expect(draft!.steps).toBe(30);
    expect(draft!.model).toBe('sdxl');
    // A fork explores the same point again, so the seed is preserved.
    expect(draft!.seed).toBe(42);
  });

  it('re-rolls with a fresh seed rather than reproducing the same image', () => {
    const node = seedNode();
    render(<IterationNodeDetail node={node} />);

    fireEvent.click(screen.getByRole('button', { name: /re-roll from this iteration/i }));

    const draft = useAppStore.getState().generationDraft;
    expect(draft).not.toBeNull();
    expect(draft!.prompt).toBe('a cinematic portrait');
    expect(draft!.seed).toBe(-1);
  });

  it('still lets the node be pinned and annotated', () => {
    const node = seedNode();
    render(<IterationNodeDetail node={node} />);

    fireEvent.click(screen.getByRole('button', { name: /^pin$/i }));
    expect(useAppStore.getState().iterationNodes.get('job-1')!.isPinned).toBe(true);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'keep this one' } });
    expect(useAppStore.getState().iterationNodes.get('job-1')!.note).toBe('keep this one');
  });
});
