import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { PipelineWorkspace } from './PipelineWorkspace';

describe('PipelineWorkspace', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });
  afterEach(cleanup);

  it('picks a pipeline through activePipelineId', () => {
    render(<PipelineWorkspace />);
    const faceRestore = useAppStore.getState().pipelines.find((p) => p.name === 'Face Restore')!;
    fireEvent.change(screen.getByLabelText('Pipeline'), { target: { value: faceRestore.id } });

    expect(useAppStore.getState().activePipelineId).toBe(faceRestore.id);
    expect(screen.getByRole('button', { name: 'Face Restore' })).toBeInTheDocument();
  });

  it('re-renders when pipelines change', () => {
    render(<PipelineWorkspace />);
    act(() => {
      useAppStore.getState().createPipeline({ name: 'Mine', description: '', steps: [] });
    });
    expect(screen.getByRole('option', { name: 'Mine' })).toBeInTheDocument();
  });

  it('creates and selects a new pipeline', () => {
    render(<PipelineWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    const created = useAppStore.getState().pipelines.at(-1)!;
    expect(created.name).toBe('New Pipeline');
    expect(useAppStore.getState().activePipelineId).toBe(created.id);
  });
});
