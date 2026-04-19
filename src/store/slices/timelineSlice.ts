import type { AppSet } from '../appStore.types';
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

export function createTimelineActions(set: AppSet) {
  return {
    setTimelineMode: (mode: TimelineMode) => set({ timelineMode: mode }),
    timelinePlay: () => set({ playState: 'playing' }),
    timelinePause: () => set({ playState: 'paused' }),
    timelineStop: () => set({ playState: 'stopped', currentTime: 0 }),
    seekTo: (time: number) => set({ currentTime: Math.max(0, time) }),
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
