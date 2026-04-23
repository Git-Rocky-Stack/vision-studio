import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { ReferenceMediaPanel } from './ReferenceMediaPanel';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('ReferenceMediaPanel', () => {
  beforeEach(resetStore);

  it('creates a scoped reference set from a reference-ready asset', () => {
    const project = useAppStore.getState().createProject('Launch Board');
    const scene = useAppStore.getState().addScene(project.id, { name: 'Scene 1' });

    useAppStore.setState((state) => ({
      ...state,
      assetLibrary: [
        {
          id: 'asset-reference-1',
          jobId: 'asset-reference-1',
          name: 'Hero still',
          type: 'image',
          path: 'C:/vision-studio-output/refs/hero-still.png',
          previewUrl: 'file:///C:/vision-studio-output/refs/hero-still.png',
          thumbnail: 'file:///C:/vision-studio-output/refs/hero-still.png',
          createdAt: '2026-04-22T00:00:00.000Z',
          prompt: '',
          negativePrompt: '',
          favorite: false,
          params: {
            source: 'generated',
            reference_ready: true,
          },
        },
      ],
    }));

    render(
      <ReferenceMediaPanel
        testId="scene-reference-panel"
        title="Scene References"
        description="Attach references."
        scope="scene"
        projectId={project.id}
        sceneId={scene.id}
      />,
    );

    fireEvent.change(screen.getByTestId('scene-reference-panel-slot-select'), {
      target: { value: 'character' },
    });
    fireEvent.change(screen.getByTestId('scene-reference-panel-media-select'), {
      target: { value: 'asset:asset-reference-1' },
    });
    fireEvent.click(screen.getByTestId('scene-reference-panel-add-button'));

    const state = useAppStore.getState();
    const referenceSet = state.referenceSets[0];
    const storedScene = state.projects[0]?.scenes[0];

    expect(referenceSet).toMatchObject({
      scope: 'scene',
      projectId: project.id,
      sceneId: scene.id,
    });
    expect(referenceSet.items).toEqual([
      expect.objectContaining({
        slot: 'character',
        label: 'Hero still',
        path: 'C:/vision-studio-output/refs/hero-still.png',
      }),
    ]);
    expect(state.mediaAssets).toEqual([
      expect.objectContaining({
        legacyAssetId: 'asset-reference-1',
        path: 'C:/vision-studio-output/refs/hero-still.png',
      }),
    ]);
    expect(storedScene?.referenceSetIds).toContain(referenceSet.id);
    expect(storedScene?.referenceImages).toEqual([
      expect.objectContaining({
        type: 'character',
        referenceSetId: referenceSet.id,
      }),
    ]);
  });

  it('removes a reference item and clears the scene adapter entry', () => {
    const project = useAppStore.getState().createProject('Launch Board');
    const scene = useAppStore.getState().addScene(project.id, { name: 'Scene 1' });

    useAppStore.getState().upsertMediaAsset({
      id: 'media-reference-1',
      legacyAssetId: null,
      jobId: null,
      name: 'Hero still',
      type: 'image',
      source: 'imported',
      path: 'C:/vision-studio-output/refs/hero-still.png',
      previewUrl: 'file:///C:/vision-studio-output/refs/hero-still.png',
      thumbnailUrl: 'file:///C:/vision-studio-output/refs/hero-still.png',
      posterUrl: 'file:///C:/vision-studio-output/refs/hero-still.png',
      metadata: {},
      createdAt: '2026-04-22T00:00:00.000Z',
    });

    const referenceSet = useAppStore.getState().createReferenceSet({
      name: 'Scene References',
      scope: 'scene',
      projectId: project.id,
      sceneId: scene.id,
      items: [
        {
          id: 'reference-item-1',
          slot: 'composition',
          mediaAssetId: 'media-reference-1',
          path: 'C:/vision-studio-output/refs/hero-still.png',
          label: 'Hero still',
          orderIndex: 0,
        },
      ],
    });

    render(
      <ReferenceMediaPanel
        testId="scene-reference-panel"
        title="Scene References"
        description="Attach references."
        scope="scene"
        projectId={project.id}
        sceneId={scene.id}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Hero still' }));

    const state = useAppStore.getState();
    const storedReferenceSet = state.referenceSets.find((item) => item.id === referenceSet.id);
    const storedScene = state.projects[0]?.scenes[0];

    expect(storedReferenceSet?.items).toEqual([]);
    expect(storedScene?.referenceImages).toEqual([]);
  });
});
