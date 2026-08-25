import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '../appStore';
import { selectActiveRegionLock, selectActiveScene } from './projectSlice';

/**
 * These selectors exist to keep the Konva canvas subtree off the re-render path
 * of unrelated project writes. `useShallow` compares selector output by
 * identity, so the contract under test is not just "returns the right object"
 * but "returns the SAME object when nothing relevant changed". A selector that
 * returned a fresh object each call would be correct and still useless.
 */
describe('project selectors', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  function seed() {
    const { createProject, addScene, setActiveProject, setActiveScene } = useAppStore.getState();
    const active = createProject('Active', { width: 640, height: 480 });
    // A decoy scene ahead of the real one: a selector that reaches for
    // `scenes[0]` instead of honouring activeSceneId must not pass.
    const decoy = addScene(active.id);
    const scene = addScene(active.id);
    setActiveProject(active.id);
    setActiveScene(scene.id);
    const lock = useAppStore.getState().createRegionLock(scene.id, 'frame-1', { name: 'Region 1' });
    useAppStore.setState({ activeRegionId: lock.id });
    const unrelated = createProject('Unrelated', { width: 640, height: 480 });
    return { activeId: active.id, sceneId: scene.id, decoyId: decoy.id, lockId: lock.id, unrelatedId: unrelated.id };
  }

  describe('selectActiveRegionLock', () => {
    it('resolves the lock targeted by activeRegionId', () => {
      const { lockId } = seed();
      expect(selectActiveRegionLock(useAppStore.getState())?.id).toBe(lockId);
    });

    it('returns null when no region is targeted', () => {
      seed();
      useAppStore.setState({ activeRegionId: null });
      expect(selectActiveRegionLock(useAppStore.getState())).toBeNull();
    });

    it('returns null when the targeted lock is not on the active scene', () => {
      seed();
      useAppStore.setState({ activeRegionId: 'no-such-lock' });
      expect(selectActiveRegionLock(useAppStore.getState())).toBeNull();
    });

    it('keeps the same lock reference across an unrelated project write', () => {
      const { unrelatedId } = seed();
      const before = selectActiveRegionLock(useAppStore.getState());
      useAppStore.getState().updateProject(unrelatedId, { name: 'Renamed' });
      expect(selectActiveRegionLock(useAppStore.getState())).toBe(before);
    });

    it('keeps the same lock reference across a write to a different lock', () => {
      const { sceneId } = seed();
      const other = useAppStore.getState().createRegionLock(sceneId, 'frame-1', { name: 'Region 2' });
      const before = selectActiveRegionLock(useAppStore.getState());
      useAppStore.getState().updateRegionLock(sceneId, other.id, { name: 'Touched' });
      expect(selectActiveRegionLock(useAppStore.getState())).toBe(before);
    });

    it('yields a new reference when the targeted lock itself is written', () => {
      const { sceneId, lockId } = seed();
      const before = selectActiveRegionLock(useAppStore.getState());
      useAppStore.getState().updateRegionLock(sceneId, lockId, { name: 'Renamed region' });
      const after = selectActiveRegionLock(useAppStore.getState());
      expect(after).not.toBe(before);
      expect(after?.name).toBe('Renamed region');
    });
  });

  describe('selectActiveScene', () => {
    it('resolves the active scene', () => {
      const { sceneId } = seed();
      expect(selectActiveScene(useAppStore.getState())?.id).toBe(sceneId);
    });

    it('returns null when no scene is active', () => {
      seed();
      useAppStore.setState({ activeSceneId: null });
      expect(selectActiveScene(useAppStore.getState())).toBeNull();
    });

    it('keeps the same scene reference across an unrelated project write', () => {
      const { unrelatedId } = seed();
      const before = selectActiveScene(useAppStore.getState());
      useAppStore.getState().updateProject(unrelatedId, { name: 'Renamed' });
      expect(selectActiveScene(useAppStore.getState())).toBe(before);
    });

    it('keeps the same scene reference across a region write on another scene', () => {
      const { activeId } = seed();
      const otherScene = useAppStore.getState().addScene(activeId);
      const before = selectActiveScene(useAppStore.getState());
      useAppStore.getState().createRegionLock(otherScene.id, 'frame-1', { name: 'Elsewhere' });
      expect(selectActiveScene(useAppStore.getState())).toBe(before);
    });

    it('yields a new reference when the active scene itself is written', () => {
      const { sceneId } = seed();
      const before = selectActiveScene(useAppStore.getState());
      useAppStore.getState().createRegionLock(sceneId, 'frame-1', { name: 'Region 2' });
      expect(selectActiveScene(useAppStore.getState())).not.toBe(before);
    });
  });
});
