import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { CameraKeyframe } from '@/types/project';

import { SceneCameraPanel } from './SceneCameraPanel';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

function seedScene() {
  const project = useAppStore.getState().createProject('Cam Test');
  useAppStore.getState().setActiveProject(project.id);
  const scene = useAppStore.getState().addScene(project.id);
  useAppStore.getState().setActiveScene(scene.id);
  return { projectId: project.id, sceneId: scene.id };
}

function camera(projectId: string, sceneId: string): CameraKeyframe[] {
  return (
    useAppStore
      .getState()
      .projects.find((p) => p.id === projectId)!
      .scenes.find((s) => s.id === sceneId)!.camera ?? []
  );
}

describe('SceneCameraPanel', () => {
  beforeEach(resetStore);
  afterEach(cleanup);

  it('starts empty and says so', () => {
    const { projectId, sceneId } = seedScene();
    render(<SceneCameraPanel projectId={projectId} sceneId={sceneId} />);

    expect(screen.getByText(/no camera moves/i)).toBeInTheDocument();
  });

  it('adds a camera keyframe at a neutral resting position', () => {
    const { projectId, sceneId } = seedScene();
    render(<SceneCameraPanel projectId={projectId} sceneId={sceneId} />);

    fireEvent.click(screen.getByRole('button', { name: /add camera keyframe/i }));

    const keys = camera(projectId, sceneId);
    expect(keys).toHaveLength(1);
    expect(keys[0].pan).toEqual({ x: 0, y: 0 });
    expect(keys[0].zoom).toBe(1);
    expect(keys[0].rotation).toBe(0);
    expect(keys[0].interpolation).toBe('linear');
  });

  it('spaces each new keyframe after the last one on the timeline', () => {
    const { projectId, sceneId } = seedScene();
    render(<SceneCameraPanel projectId={projectId} sceneId={sceneId} />);

    const add = screen.getByRole('button', { name: /add camera keyframe/i });
    fireEvent.click(add);
    fireEvent.click(add);

    const keys = camera(projectId, sceneId);
    expect(keys).toHaveLength(2);
    expect(keys[1].time).toBeGreaterThan(keys[0].time);
  });

  it('edits the selected keyframe through the camera editor', () => {
    const { projectId, sceneId } = seedScene();
    render(<SceneCameraPanel projectId={projectId} sceneId={sceneId} />);
    fireEvent.click(screen.getByRole('button', { name: /add camera keyframe/i }));

    fireEvent.change(screen.getByLabelText(/interpolation/i), {
      target: { value: 'ease-in-out' },
    });

    expect(camera(projectId, sceneId)[0].interpolation).toBe('ease-in-out');
  });

  it('deletes a camera keyframe', () => {
    const { projectId, sceneId } = seedScene();
    render(<SceneCameraPanel projectId={projectId} sceneId={sceneId} />);
    fireEvent.click(screen.getByRole('button', { name: /add camera keyframe/i }));

    fireEvent.click(screen.getByRole('button', { name: /delete camera keyframe 1/i }));

    expect(camera(projectId, sceneId)).toHaveLength(0);
  });

  it('keeps keyframes ordered by time', () => {
    const { projectId, sceneId } = seedScene();
    useAppStore.getState().updateScene(projectId, sceneId, {
      camera: [
        { id: 'k2', time: 2000, pan: { x: 0, y: 0 }, zoom: 1, rotation: 0, interpolation: 'linear', easingStrength: 0.5 },
        { id: 'k1', time: 500, pan: { x: 0, y: 0 }, zoom: 1, rotation: 0, interpolation: 'linear', easingStrength: 0.5 },
      ],
    });
    render(<SceneCameraPanel projectId={projectId} sceneId={sceneId} />);

    const items = screen.getAllByRole('button', { name: /^Camera keyframe \d+ at /i });
    expect(items[0]).toHaveAccessibleName(/at 0\.5s/);
    expect(items[1]).toHaveAccessibleName(/at 2\.0s/);
  });

  it('selects a keyframe so the editor targets it', () => {
    const { projectId, sceneId } = seedScene();
    render(<SceneCameraPanel projectId={projectId} sceneId={sceneId} />);
    const add = screen.getByRole('button', { name: /add camera keyframe/i });
    fireEvent.click(add);
    fireEvent.click(add);

    fireEvent.click(screen.getByRole('button', { name: /^Camera keyframe 1 at /i }));
    fireEvent.change(screen.getByLabelText(/interpolation/i), {
      target: { value: 'ease-out' },
    });

    const keys = camera(projectId, sceneId);
    expect(keys[0].interpolation).toBe('ease-out');
    expect(keys[1].interpolation).toBe('linear');
  });
});
