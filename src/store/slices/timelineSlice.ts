import type { AppGet, AppSet } from '../appStore.types';
import type { TimelineMode, Keyframe } from '@/types/timeline';

export const timelineInitialState = {
  // Engine
  timelineMode: 'canvas' as TimelineMode,
  playState: 'stopped' as const,
  currentTime: 0,
  timelineFps: 24,
  timelineLoop: false,
  timelineSpeed: 1,
  // Onion skin
  onionSkinEnabled: false,
  onionSkinFrameCount: 2,
  onionSkinOpacity: 0.3,
  onionSkinDirection: 'both' as const,
  // Keyframes
  keyframes: [] as Keyframe[],
  activeKeyframeId: null as string | null,
};

function resolveTimelineBounds(get: AppGet) {
  const state = get();
  const activeSequence = state.activeTimelineSequenceId
    ? state.timelineSequences.find((sequence) => sequence.id === state.activeTimelineSequenceId) ?? null
    : null;

  if (!activeSequence) {
    return {
      minTime: 0,
      maxTime: Number.POSITIVE_INFINITY,
      resetTime: 0,
    };
  }

  const minTime = activeSequence.playRange?.startMs ?? 0;
  const maxTime = activeSequence.playRange
    ? Math.max(minTime, activeSequence.playRange.endMs)
    : activeSequence.durationMs > 0
      ? Math.max(minTime, activeSequence.durationMs)
      : Number.POSITIVE_INFINITY;

  return {
    minTime,
    maxTime,
    resetTime: minTime,
  };
}

function clampTimelineTime(get: AppGet, time: number) {
  const { minTime, maxTime } = resolveTimelineBounds(get);
  return Math.max(minTime, Math.min(maxTime, time));
}

export function createTimelineActions(set: AppSet, get: AppGet) {
  return {
    setTimelineMode: (mode: TimelineMode) => set({ timelineMode: mode }),
    timelinePlay: () =>
      set((state) => {
        const nextTime = clampTimelineTime(get, state.currentTime);
        return {
          playState: 'playing',
          currentTime: nextTime,
        };
      }),
    timelinePause: () => set({ playState: 'paused' }),
    timelineStop: () => {
      const { resetTime } = resolveTimelineBounds(get);
      set({ playState: 'stopped', currentTime: resetTime });
    },
    toggleTimelinePlayback: () =>
      set((state) => ({
        playState: state.playState === 'playing' ? 'paused' : 'playing',
        currentTime: clampTimelineTime(get, state.currentTime),
      })),
    seekTo: (time: number) => set({ currentTime: clampTimelineTime(get, time) }),
    seekBy: (deltaMs: number) =>
      set((state) => ({
        currentTime: clampTimelineTime(get, state.currentTime + deltaMs),
      })),
    setTimelineFps: (fps: number) => set({ timelineFps: fps }),
    setTimelineSpeed: (speed: number) => set({ timelineSpeed: speed }),
    toggleTimelineLoop: () => set((s) => ({ timelineLoop: !s.timelineLoop })),
    // Onion skin
    setOnionSkinEnabled: (enabled: boolean) => set({ onionSkinEnabled: enabled }),
    setOnionSkinFrameCount: (count: number) => set({ onionSkinFrameCount: count }),
    setOnionSkinOpacity: (opacity: number) => set({ onionSkinOpacity: opacity }),
    setOnionSkinDirection: (dir: 'prev' | 'next' | 'both') => set({ onionSkinDirection: dir }),
    // Keyframes
    addKeyframe: (kf: Keyframe) => set((s) => ({ keyframes: [...s.keyframes, kf] })),
    updateKeyframe: (id: string, updates: Partial<Keyframe>) =>
      set((s) => ({
        keyframes: s.keyframes.map((k) => (k.id === id ? { ...k, ...updates } : k)),
      })),
    deleteKeyframe: (id: string) =>
      set((s) => ({ keyframes: s.keyframes.filter((k) => k.id !== id) })),
    setActiveKeyframeId: (id: string | null) => set({ activeKeyframeId: id }),
  };
}
