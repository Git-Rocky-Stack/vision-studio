import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { CharacterLibrary } from './CharacterLibrary';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

/** Seed a project with one scene and two characters; returns their ids. */
function seedProject() {
  const project = useAppStore.getState().createProject('Cast Test');
  useAppStore.getState().setActiveProject(project.id);
  const scene = useAppStore.getState().addScene(project.id);
  useAppStore.getState().setActiveScene(scene.id);

  for (const name of ['Nova', 'Rook']) {
    useAppStore.getState().addCharacter(project.id, {
      name,
      description: '',
      faceImages: [],
      bodyImages: [],
      styleImages: [],
      lockedFeatures: [],
      consistencyStrength: 0.85,
      color: '#e63946',
    });
  }

  const stored = useAppStore.getState().projects.find((p) => p.id === project.id)!;
  return { projectId: project.id, sceneId: scene.id, characters: stored.characters };
}

function sceneRefs(projectId: string, sceneId: string): string[] {
  return (
    useAppStore
      .getState()
      .projects.find((p) => p.id === projectId)!
      .scenes.find((s) => s.id === sceneId)!.characterRefs ?? []
  );
}

describe('CharacterLibrary scene assignment', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('assigns a character to the active scene when its card is activated', () => {
    const { projectId, sceneId } = seedProject();
    render(<CharacterLibrary projectId={projectId} />);

    fireEvent.click(screen.getByRole('button', { name: /^Nova, / }));

    expect(sceneRefs(projectId, sceneId)).toEqual([
      useAppStore.getState().projects.find((p) => p.id === projectId)!.characters[0].id,
    ]);
  });

  it('removes the character again on a second activation', () => {
    const { projectId, sceneId } = seedProject();
    render(<CharacterLibrary projectId={projectId} />);

    const card = screen.getByRole('button', { name: /^Nova, / });
    fireEvent.click(card);
    fireEvent.click(card);

    expect(sceneRefs(projectId, sceneId)).toEqual([]);
  });

  it('marks a card selected only while it is on the active scene', () => {
    const { projectId } = seedProject();
    render(<CharacterLibrary projectId={projectId} />);

    const nova = screen.getByRole('button', { name: /^Nova, / });
    const rook = screen.getByRole('button', { name: /^Rook, / });
    expect(nova).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(nova);

    expect(screen.getByRole('button', { name: /^Nova, / })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(rook).toHaveAttribute('aria-selected', 'false');
  });

  it('reflects the assignment in the scene count on the card', () => {
    const { projectId } = seedProject();
    render(<CharacterLibrary projectId={projectId} />);

    fireEvent.click(screen.getByRole('button', { name: /^Nova, 0 scenes/ }));

    expect(screen.getByRole('button', { name: /^Nova, 1 scene$/ })).toBeInTheDocument();
  });

  it('leaves the cast alone when there is no active scene to assign to', () => {
    const { projectId } = seedProject();
    useAppStore.getState().setActiveScene(null);
    render(<CharacterLibrary projectId={projectId} />);

    fireEvent.click(screen.getByRole('button', { name: /^Nova, / }));

    const scenes = useAppStore.getState().projects.find((p) => p.id === projectId)!.scenes;
    expect(scenes.every((s) => s.characterRefs.length === 0)).toBe(true);
  });
});
