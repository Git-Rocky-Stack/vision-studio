import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Profiler } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import { EditPropertiesPanel } from './EditPropertiesPanel';

describe('EditPropertiesPanel', () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it('renders the initial adjustment tab without a runtime initialization error', () => {
    expect(() => render(<EditPropertiesPanel />)).not.toThrow();

    expect(screen.getByRole('tab', { name: /adjust/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('No layers')).not.toBeInTheDocument();
  });

  it('switches to the control inspector when an active canvas control layer exists', async () => {
    const state = useAppStore.getState();
    const project = state.createProject('Canvas controls');
    const scene = state.addScene(project.id, { name: 'Shot 1' });

    state.setActiveProject(project.id);
    state.setActiveScene(scene.id);
    state.createCanvasControlLayer(scene.id, { name: 'Guide layer' });

    render(<EditPropertiesPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('canvas-control-layer-properties')).toBeInTheDocument();
    });

    expect(screen.getByRole('tab', { name: /control/i })).toHaveAttribute('aria-selected', 'true');
  });

  // Same defect class EditCanvas was fixed for: this panel derived the active
  // region lock, the active scene and the active control layer by hand from a
  // `projects` array subscription. Every project writer rebuilds `projects`
  // wholesale (projectSlice.ts:715), so a new array identity reached useShallow
  // on writes with nothing to do with this panel -- renaming another project,
  // writing a region on another scene -- and re-rendered the whole inspector,
  // including the filter grid and every slider under it.
  describe('render isolation from unrelated project state', () => {
    function seedActiveRegion() {
      const state = useAppStore.getState();
      const active = state.createProject('Active');
      const scene = state.addScene(active.id, { name: 'Shot 1' });
      state.setActiveProject(active.id);
      state.setActiveScene(scene.id);
      const lock = useAppStore.getState().createRegionLock(scene.id, 'frame-1', { name: 'Region 1' });
      useAppStore.setState({ regionMode: true, activeRegionId: lock.id });
      const unrelated = useAppStore.getState().createProject('Unrelated');
      return { sceneId: scene.id, lockId: lock.id, unrelatedId: unrelated.id };
    }

    function renderCounted() {
      let commits = 0;
      render(
        <Profiler id="edit-properties" onRender={() => { commits += 1; }}>
          <EditPropertiesPanel />
        </Profiler>,
      );
      return () => commits;
    }

    /**
     * Absorbs the one commit every subtree pays on its first post-mount store
     * notification, whatever changed.
     *
     * Measured, not assumed: writing `promptHistory` -- a field nothing in this
     * subtree subscribes to -- costs 1 commit the first time and 0 every time
     * after, and with that write done first an unrelated `updateProject` costs
     * 0 rather than 1. Counting from a cold mount therefore measured a
     * useSyncExternalStore snapshot settling, not a `projects` subscription,
     * and would have reported the defect as fixed at 1 commit either way.
     * Warming first is what makes the assertions below exact.
     */
    async function warmStoreSubscription() {
      await act(async () => {
        useAppStore.setState({ promptHistory: useAppStore.getState().promptHistory });
      });
    }

    it('does not re-render when an unrelated project mutates', async () => {
      const { unrelatedId } = seedActiveRegion();
      const commits = renderCounted();
      await act(async () => {});

      // Sanity: the region inspector really is mounted, so we are counting
      // commits of the live panel rather than an early-returned placeholder.
      expect(screen.getByRole('tab', { name: /region/i })).toHaveAttribute('aria-selected', 'true');

      await warmStoreSubscription();
      const baseline = commits();
      await act(async () => {
        useAppStore.getState().updateProject(unrelatedId, { name: 'Renamed' });
      });

      expect(commits()).toBe(baseline);
    });

    it('does not re-render when a region on another scene is written', async () => {
      const state = useAppStore.getState();
      const active = state.createProject('Active');
      const scene = state.addScene(active.id, { name: 'Shot 1' });
      const otherScene = useAppStore.getState().addScene(active.id, { name: 'Shot 2' });
      state.setActiveProject(active.id);
      state.setActiveScene(scene.id);
      const lock = useAppStore.getState().createRegionLock(scene.id, 'frame-1', { name: 'Region 1' });
      useAppStore.setState({ regionMode: true, activeRegionId: lock.id });

      const commits = renderCounted();
      await act(async () => {});

      await warmStoreSubscription();
      const baseline = commits();
      await act(async () => {
        useAppStore.getState().createRegionLock(otherScene.id, 'frame-1', { name: 'Elsewhere' });
      });

      expect(commits()).toBe(baseline);
    });

    it('still re-renders when the active region lock itself changes', async () => {
      const { sceneId, lockId } = seedActiveRegion();
      const commits = renderCounted();
      await act(async () => {});

      const baseline = commits();
      await act(async () => {
        useAppStore.getState().updateRegionLock(sceneId, lockId, { name: 'Renamed region' });
      });

      expect(commits()).toBeGreaterThan(baseline);
    });

    it('still re-renders when the active scene itself changes', async () => {
      const state = useAppStore.getState();
      const active = state.createProject('Active');
      const scene = state.addScene(active.id, { name: 'Shot 1' });
      state.setActiveProject(active.id);
      state.setActiveScene(scene.id);
      state.createCanvasControlLayer(scene.id, { name: 'Guide layer' });

      const commits = renderCounted();
      await waitFor(() => {
        expect(screen.getByTestId('canvas-control-layer-properties')).toBeInTheDocument();
      });

      const baseline = commits();
      await act(async () => {
        useAppStore.getState().createCanvasControlLayer(scene.id, { name: 'Second layer' });
      });

      expect(commits()).toBeGreaterThan(baseline);
    });
  });
});
