import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { blendNotApplied } from '@/features/edit/runGuidedEditTool';

import { EditPropertiesPanel } from './EditPropertiesPanel';

const runGuidedEditTool = vi.hoisted(() => vi.fn());

vi.mock('@/features/edit/runGuidedEditTool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/edit/runGuidedEditTool')>()),
  runGuidedEditTool,
}));

describe('EditPropertiesPanel Region Lock blend feedback', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
    runGuidedEditTool.mockReset();
  });
  afterEach(cleanup);

  it('sends the Blend Edges request and shows why a blend was skipped', async () => {
    runGuidedEditTool.mockResolvedValue({
      ok: true,
      jobId: 'gen-1',
      notice: blendNotApplied('pixels unreadable'),
    });
    const state = useAppStore.getState();
    const project = state.createProject('P');
    const scene = state.addScene(project.id, { name: 'S' });
    state.setActiveProject(project.id);
    state.setActiveScene(scene.id);
    state.setCurrentImage('img.png', 'C:/img.png');
    const lock = useAppStore.getState().createRegionLock(scene.id, 'f1', {
      name: 'R',
      aiTool: 'generative-fill',
      prompt: 'a red door',
      mask: {
        type: 'rectangle',
        points: [{ x: 0, y: 0 }, { x: 4, y: 4 }],
        bounds: { x: 0, y: 0, width: 4, height: 4 },
        featherRadius: 5,
        blendEdges: true,
      },
    });

    render(<EditPropertiesPanel />);
    fireEvent.click(screen.getByRole('tab', { name: /region/i }));
    await act(async () => {
      useAppStore.getState().setActiveRegionId(lock.id);
    });
    const generate = await screen.findByRole('button', { name: /generate region/i });
    await act(async () => {
      fireEvent.click(generate);
    });

    expect(runGuidedEditTool).toHaveBeenCalledWith(
      'generative-fill',
      expect.objectContaining({ blend: { featherRadius: 5 } }),
      expect.any(Object),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Blend Edges was not applied (pixels unreadable), so the unblended result is shown.',
    );
  });
});
