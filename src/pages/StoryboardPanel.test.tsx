import { memo } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAppStore } from '@/store/appStore';

// Count SceneCard renders per scene, keeping the real memo boundary, so the
// test proves the panel hands each card stable props.
const sceneCardRenders = vi.hoisted(() => new Map<string, number>());
vi.mock('@/components/storyboard/SceneCard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/storyboard/SceneCard')>();
  const Real = actual.SceneCard as unknown as (props: Record<string, unknown>) => React.ReactElement;
  const Counted = memo(function CountedSceneCard(props: Record<string, unknown>) {
    const scene = props.scene as { id: string };
    sceneCardRenders.set(scene.id, (sceneCardRenders.get(scene.id) ?? 0) + 1);
    return <Real {...props} />;
  });
  return { ...actual, SceneCard: Counted };
});

import { StoryboardPanel } from './StoryboardPanel';

function seedProject() {
  const state = useAppStore.getState();
  const project = state.createProject('Board');
  state.setActiveProject(project.id);
  const first = state.addScene(project.id, { name: 'Opening' });
  const second = state.addScene(project.id, { name: 'Middle' });
  const third = state.addScene(project.id, { name: 'Ending' });
  return { project, first, second, third };
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  sceneCardRenders.clear();
});
afterEach(cleanup);

describe('StoryboardPanel', () => {
  it('edits the transition between scenes from the transition picker', async () => {
    const user = userEvent.setup();
    const { project, first } = seedProject();
    render(<StoryboardPanel />);

    const [firstTransition] = screen.getAllByTestId('transition-indicator');
    await user.click(firstTransition);
    const picker = screen.getByRole('dialog', { name: 'Transition after Opening' });
    await user.click(within(picker).getByRole('radio', { name: 'Dissolve' }));

    const scene = useAppStore
      .getState()
      .projects.find((item) => item.id === project.id)
      ?.scenes.find((item) => item.id === first.id);
    expect(scene?.transitions).toEqual({ type: 'dissolve', duration: 500 });
    expect(firstTransition).toHaveAccessibleName('Dissolve transition, 500ms');
  });

  it('does not re-render the other scene cards when one scene changes', () => {
    const { project, second } = seedProject();
    render(<StoryboardPanel />);
    const before = new Map(sceneCardRenders);

    act(() => {
      useAppStore.getState().updateScene(project.id, second.id, { name: 'Middle (revised)' });
    });

    expect(screen.getByRole('button', { name: /Middle \(revised\)/ })).toBeInTheDocument();
    for (const [sceneId, count] of before) {
      if (sceneId === second.id) {
        expect(sceneCardRenders.get(sceneId)).toBeGreaterThan(count);
      } else {
        expect(sceneCardRenders.get(sceneId)).toBe(count);
      }
    }
  });

  it('routes the id-taking card actions to the right scene', async () => {
    const user = userEvent.setup();
    const { project, first } = seedProject();
    render(<StoryboardPanel />);

    await user.click(screen.getByRole('button', { name: /Scene 01: Opening/ }));
    expect(useAppStore.getState().activeSceneId).toBe(first.id);

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete scene' });
    await user.click(deleteButtons[0]);
    expect(screen.getByRole('dialog', { name: 'Delete Scene' })).toHaveTextContent('"Opening"');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(
      useAppStore.getState().projects.find((item) => item.id === project.id)?.scenes.map((scene) => scene.name),
    ).toEqual(['Middle', 'Ending']);
  });

  describe('carrying transitions onto the timeline', () => {
    const derivedClipFor = (sceneId: string) =>
      useAppStore.getState().timelineClips.find((clip) => clip.sceneId === sceneId && clip.storyboardDerived);

    it('builds the timeline with each scene transition on its clip', async () => {
      const user = userEvent.setup();
      const { project, first, second, third } = seedProject();
      act(() => {
        useAppStore.getState().updateScene(project.id, first.id, { transitions: { type: 'dissolve', duration: 600 } });
      });
      render(<StoryboardPanel />);

      await user.click(screen.getByRole('button', { name: 'Build Timeline' }));

      expect(derivedClipFor(first.id)?.transitionOut).toEqual({ type: 'dissolve', durationMs: 600 });
      expect(derivedClipFor(second.id)?.transitionOut).toBeNull();
      expect(derivedClipFor(third.id)?.transitionOut).toBeNull();
    });

    it('updates a clip already on the timeline when its scene transition changes', async () => {
      const user = userEvent.setup();
      const { first } = seedProject();
      render(<StoryboardPanel />);
      await user.click(screen.getByRole('button', { name: 'Build Timeline' }));
      expect(derivedClipFor(first.id)?.transitionOut).toBeNull();

      const [firstTransition] = screen.getAllByTestId('transition-indicator');
      await user.click(firstTransition);
      const picker = screen.getByRole('dialog', { name: 'Transition after Opening' });
      await user.click(within(picker).getByRole('radio', { name: 'Fade' }));

      expect(derivedClipFor(first.id)?.transitionOut).toEqual({ type: 'fade', durationMs: 500 });

      await user.click(within(picker).getByRole('radio', { name: 'Cut' }));
      expect(derivedClipFor(first.id)?.transitionOut).toBeNull();
    });
  });
});
