import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '@/store/appStore';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('TimelineEngine', () => {
  beforeEach(resetStore);

  it('defaults to canvas mode', () => {
    expect(useAppStore.getState().timelineMode).toBe('canvas');
  });

  it('defaults to stopped play state', () => {
    expect(useAppStore.getState().playState).toBe('stopped');
  });

  it('defaults currentTime to 0', () => {
    expect(useAppStore.getState().currentTime).toBe(0);
  });

  it('setTimelineMode changes the mode', () => {
    useAppStore.getState().setTimelineMode('animation');
    expect(useAppStore.getState().timelineMode).toBe('animation');
  });

  it('play sets playState to playing', () => {
    useAppStore.getState().timelinePlay();
    expect(useAppStore.getState().playState).toBe('playing');
  });

  it('pause sets playState to paused', () => {
    useAppStore.getState().timelinePlay();
    useAppStore.getState().timelinePause();
    expect(useAppStore.getState().playState).toBe('paused');
  });

  it('stop resets playState and currentTime', () => {
    useAppStore.getState().timelinePlay();
    useAppStore.getState().seekTo(5000);
    useAppStore.getState().timelineStop();
    expect(useAppStore.getState().playState).toBe('stopped');
    expect(useAppStore.getState().currentTime).toBe(0);
  });

  it('seekTo sets currentTime', () => {
    useAppStore.getState().seekTo(3000);
    expect(useAppStore.getState().currentTime).toBe(3000);
  });

  it('setTimelineSpeed changes playback speed', () => {
    useAppStore.getState().setTimelineSpeed(2);
    expect(useAppStore.getState().timelineSpeed).toBe(2);
  });

  it('toggleTimelineLoop toggles loop', () => {
    expect(useAppStore.getState().timelineLoop).toBe(false);
    useAppStore.getState().toggleTimelineLoop();
    expect(useAppStore.getState().timelineLoop).toBe(true);
  });
});

describe('TimelineEngine - Onion Skin', () => {
  beforeEach(resetStore);

  it('defaults onion skin to disabled', () => {
    expect(useAppStore.getState().onionSkinEnabled).toBe(false);
  });

  it('setOnionSkinEnabled toggles onion skin', () => {
    useAppStore.getState().setOnionSkinEnabled(true);
    expect(useAppStore.getState().onionSkinEnabled).toBe(true);
  });

  it('setOnionSkinFrameCount sets frame count', () => {
    useAppStore.getState().setOnionSkinFrameCount(3);
    expect(useAppStore.getState().onionSkinFrameCount).toBe(3);
  });

  it('setOnionSkinOpacity sets opacity', () => {
    useAppStore.getState().setOnionSkinOpacity(0.4);
    expect(useAppStore.getState().onionSkinOpacity).toBe(0.4);
  });

  it('setOnionSkinDirection sets direction', () => {
    useAppStore.getState().setOnionSkinDirection('prev');
    expect(useAppStore.getState().onionSkinDirection).toBe('prev');
  });
});

describe('TimelineEngine - Keyframe CRUD', () => {
  beforeEach(resetStore);

  it('defaults to empty keyframes', () => {
    expect(useAppStore.getState().keyframes).toEqual([]);
  });

  it('defaults activeKeyframeId to null', () => {
    expect(useAppStore.getState().activeKeyframeId).toBeNull();
  });

  it('addKeyframe adds a keyframe', () => {
    const kf = {
      id: 'kf-1',
      entityId: 'entity-1',
      entityType: 'layer' as const,
      property: 'opacity',
      time: 1000,
      value: 0.5,
      interpolation: 'ease-in' as const,
      easingStrength: 0.7,
    };
    useAppStore.getState().addKeyframe(kf);
    expect(useAppStore.getState().keyframes).toHaveLength(1);
    expect(useAppStore.getState().keyframes[0].id).toBe('kf-1');
  });

  it('updateKeyframe updates a specific keyframe', () => {
    const kf = {
      id: 'kf-1',
      entityId: 'entity-1',
      entityType: 'layer' as const,
      property: 'opacity',
      time: 1000,
      value: 0.5,
      interpolation: 'linear' as const,
      easingStrength: 0.7,
    };
    useAppStore.getState().addKeyframe(kf);
    useAppStore.getState().updateKeyframe('kf-1', { value: 1.0 });
    expect(useAppStore.getState().keyframes[0].value).toBe(1.0);
  });

  it('updateKeyframe does not mutate other keyframes', () => {
    useAppStore.getState().addKeyframe({
      id: 'kf-1', entityId: 'e1', entityType: 'layer', property: 'opacity',
      time: 0, value: 0.5, interpolation: 'linear', easingStrength: 0.5,
    });
    useAppStore.getState().addKeyframe({
      id: 'kf-2', entityId: 'e2', entityType: 'layer', property: 'opacity',
      time: 1000, value: 0.8, interpolation: 'ease-in', easingStrength: 0.7,
    });
    useAppStore.getState().updateKeyframe('kf-1', { value: 0.1 });
    expect(useAppStore.getState().keyframes[1].value).toBe(0.8);
  });

  it('deleteKeyframe removes a keyframe', () => {
    useAppStore.getState().addKeyframe({
      id: 'kf-1', entityId: 'e1', entityType: 'layer', property: 'opacity',
      time: 0, value: 0.5, interpolation: 'linear', easingStrength: 0.5,
    });
    useAppStore.getState().deleteKeyframe('kf-1');
    expect(useAppStore.getState().keyframes).toHaveLength(0);
  });

  it('setActiveKeyframeId sets the active keyframe', () => {
    useAppStore.getState().setActiveKeyframeId('kf-1');
    expect(useAppStore.getState().activeKeyframeId).toBe('kf-1');
  });

  it('setActiveKeyframeId can be set back to null', () => {
    useAppStore.getState().setActiveKeyframeId('kf-1');
    useAppStore.getState().setActiveKeyframeId(null);
    expect(useAppStore.getState().activeKeyframeId).toBeNull();
  });
});

describe('TimelineEngine - Playback defaults', () => {
  beforeEach(resetStore);

  it('defaults fps to 24', () => {
    expect(useAppStore.getState().timelineFps).toBe(24);
  });

  it('defaults speed to 1', () => {
    expect(useAppStore.getState().timelineSpeed).toBe(1);
  });

  it('defaults loop to false', () => {
    expect(useAppStore.getState().timelineLoop).toBe(false);
  });

  it('defaults onionSkinFrameCount to 2', () => {
    expect(useAppStore.getState().onionSkinFrameCount).toBe(2);
  });

  it('defaults onionSkinOpacity to 0.3', () => {
    expect(useAppStore.getState().onionSkinOpacity).toBeCloseTo(0.3);
  });

  it('defaults onionSkinDirection to both', () => {
    expect(useAppStore.getState().onionSkinDirection).toBe('both');
  });

  it('seekTo clamps negative values to 0', () => {
    useAppStore.getState().seekTo(-100);
    expect(useAppStore.getState().currentTime).toBe(0);
  });

  it('setTimelineFps changes fps', () => {
    useAppStore.getState().setTimelineFps(30);
    expect(useAppStore.getState().timelineFps).toBe(30);
  });
});
