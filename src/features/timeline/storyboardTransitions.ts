import type { Project, SceneTransition } from '@/types/project';
import type { TimelineClip, TimelineTrack, TimelineTransition } from '@/types/timeline';

/**
 * Carries storyboard scene transitions onto the timeline clips derived from
 * those scenes.
 *
 * A storyboard transition sits between scene N and scene N+1 and is stored on
 * scene N (`scene.transitions`), so it maps onto the OUTGOING edge of scene
 * N's derived clip (`transitionOut`). Sequence playback already blends a clip's
 * outgoing edge into the next clip on its track (sequenceComposition.ts), so
 * writing only the outgoing edge plays the transition once; writing the next
 * clip's incoming edge as well would play it twice.
 *
 * For storyboard-derived clips the storyboard is authoritative for that edge:
 * a Cut clears it. The incoming edge stays the timeline editor's to set. Two
 * cases have no storyboard opinion and leave the clip untouched: the last
 * scene (the storyboard offers no transition after it, and a fade-out set on
 * the timeline is a legitimate ending) and a legacy scene with no transition
 * record.
 */

export interface StoryboardTransitionUpdate {
  clipId: string;
  sceneId: string;
  transitionOut: TimelineTransition | null;
}

/** The timeline form of a scene transition; undefined when the scene has none recorded. */
export function toTimelineTransition(
  transition: SceneTransition | null | undefined,
  clipDurationMs?: number,
): TimelineTransition | null | undefined {
  if (!transition) return undefined;
  if (transition.type === 'cut') return null;
  const duration = Number.isFinite(transition.duration) ? Math.round(transition.duration) : 0;
  if (duration <= 0) return null;
  // A transition can never outlast the clip it leaves.
  const ceiling =
    typeof clipDurationMs === 'number' && Number.isFinite(clipDurationMs) && clipDurationMs > 0
      ? Math.round(clipDurationMs)
      : duration;
  return { type: transition.type, durationMs: Math.min(duration, ceiling) };
}

function sameTransition(left: TimelineTransition | null, right: TimelineTransition | null): boolean {
  if (left === null || right === null) return left === right;
  return left.type === right.type && left.durationMs === right.durationMs;
}

/**
 * The derived clips whose outgoing transition differs from their scene's
 * storyboard transition, with the value each should take. Pure: the caller
 * applies the updates.
 */
export function planStoryboardTransitionSync({
  project,
  timelineTracks,
  timelineClips,
  sequenceId,
  sceneIds,
}: {
  project: Pick<Project, 'scenes'>;
  timelineTracks: Pick<TimelineTrack, 'id' | 'sequenceId'>[];
  timelineClips: TimelineClip[];
  /** Limit to clips in this sequence; every sequence when omitted. */
  sequenceId?: string | null;
  /** Limit to these scenes; every scene when omitted. */
  sceneIds?: readonly string[];
}): StoryboardTransitionUpdate[] {
  const orderedScenes = [...project.scenes].sort((left, right) => left.orderIndex - right.orderIndex);
  const lastSceneId = orderedScenes[orderedScenes.length - 1]?.id ?? null;
  const wanted = sceneIds ? new Set(sceneIds) : null;
  const sequenceByTrackId = new Map(timelineTracks.map((track) => [track.id, track.sequenceId]));

  const updates: StoryboardTransitionUpdate[] = [];
  for (const scene of orderedScenes) {
    if (wanted && !wanted.has(scene.id)) continue;
    if (scene.id === lastSceneId || !scene.transitions) continue;

    // Each sequence holds its own derived clip(s) for the scene; the outgoing
    // edge belongs to the one that ends last.
    const lastClipBySequence = new Map<string, TimelineClip>();
    for (const clip of timelineClips) {
      if (clip.sceneId !== scene.id || !clip.storyboardDerived) continue;
      const clipSequenceId = sequenceByTrackId.get(clip.trackId);
      if (!clipSequenceId) continue;
      if (sequenceId && clipSequenceId !== sequenceId) continue;
      const current = lastClipBySequence.get(clipSequenceId);
      if (!current || clip.startMs + clip.durationMs > current.startMs + current.durationMs) {
        lastClipBySequence.set(clipSequenceId, clip);
      }
    }

    for (const clip of lastClipBySequence.values()) {
      const desired = toTimelineTransition(scene.transitions, clip.durationMs) ?? null;
      if (!sameTransition(clip.transitionOut, desired)) {
        updates.push({ clipId: clip.id, sceneId: scene.id, transitionOut: desired });
      }
    }
  }
  return updates;
}
