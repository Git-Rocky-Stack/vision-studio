import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { GuideStepList } from '../GuideStepList';
import { UserGuideSection } from '../UserGuideSection';

export function TimelineGuideSection() {
  return (
    <UserGuideSection
      id="guide-timeline"
      title="Timeline"
      summary="Review sequences, edit clips, mix audio, generate clip variants, approve retakes, and export the active edit."
    >
      <GuideList
        items={[
          <span>
            Use the playback surface to review the active sequence, play range, speed, and loop
            state before you commit to export.
          </span>,
          <span>
            The Clip Inspector handles timing edits, transitions, split and duplicate actions,
            track moves, storyboard context, and AI clip actions for clips that already have a
            generation binding.
          </span>,
          <span>
            AI-bound clips can use <strong>Regenerate In Place</strong>,{' '}
            <strong>Create Variant</strong>, and <strong>Extend Shot</strong> directly from the
            inspector.
          </span>,
        ]}
      />

      <GuideStepList
        steps={[
          {
            title: 'Open or create a sequence',
            description:
              'Use the sequence picker at the top of Timeline. Build Timeline from Story creates a sequence automatically; otherwise create one manually and drag clips in from Assets.',
          },
          {
            title: 'Navigate with playback transport',
            description:
              'Spacebar plays/pauses. Use the timeline scrubber to jog, or J/K/L for reverse/pause/forward when supported. Loop and speed controls live next to transport.',
          },
          {
            title: 'Set an in/out range',
            description:
              'Use Mark In and Mark Out (typically I and O) on the toolbar to scope playback and export to a specific range. Clear the range with Shift+I or the toolbar reset.',
          },
          {
            title: 'Edit clips with the Clip Inspector',
            description:
              'Select a clip on a track to load it in the Clip Inspector. Edit start/end, trim handles, transition style, and track assignment. Split, duplicate, and move actions live in the inspector toolbar.',
          },
          {
            title: 'Add and balance audio layers',
            description:
              'Drop audio assets onto an audio track. Set per-clip gain (0-2x), fade-in, fade-out, and clip offset directly on the audio clip. Mix is previewed live during playback and rendered into the export.',
          },
          {
            title: 'Export when ready',
            description:
              'Use Export MP4. The dialog summarizes the active range, dimensions, fps, and audio layer count before encoding. Successful exports surface Open and Reveal actions, even when saved outside managed roots.',
          },
        ]}
      />

      <GuideCallout title="Retake Workflow" tone="accent">
        <GuideStepList
          steps={[
            {
              title: 'Mark the retake range',
              description:
                'Use Retake In and Retake Out from the timeline toolbar to select the segment of the clip you want to redo. The range appears on the clip and in the inspector.',
            },
            {
              title: 'Generate a candidate take',
              description:
                'From the inspector, use Generate Retake. The original clip stays intact while the new take generates against the same prompt, model, and references as the source clip.',
            },
            {
              title: 'Compare candidates side by side',
              description:
                'Open the Compare surface to A/B the original and any candidate takes. Multiple takes can stack on a single clip range -- keep generating until one feels right.',
            },
            {
              title: 'Accept, reject, or revert',
              description:
                'Accept makes a take the new editorial version for playback and export. Reject removes a take from consideration. Revert restores the original clip range and discards all takes.',
            },
          ]}
        />
      </GuideCallout>

      <GuideCallout title="AI Clip Actions" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Regenerate In Place</strong> re-runs the same prompt and settings to refresh
              a clip without altering its place on the timeline.
            </span>,
            <span>
              <strong>Create Variant</strong> spawns a fresh job using the same parameters with a
              new seed, useful when you want options without losing the current take.
            </span>,
            <span>
              <strong>Extend Shot</strong> grows the clip duration by generating additional frames
              that match the existing motion and composition.
            </span>,
            <span>
              All three actions require a generation binding (the clip was created via Generate or
              Story). Imported assets show storyboard context but cannot be regenerated through
              these actions.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Audio Mixing" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Gain</strong> ranges 0-2x. Anything past 1.0 amplifies, so watch peaks if
              you mix loud sources.
            </span>,
            <span>
              <strong>Fade-in</strong> and <strong>Fade-out</strong> are millisecond-precise and
              applied as a piecewise volume curve at export time, not just during preview.
            </span>,
            <span>
              <strong>Clip offset</strong> lets you start the audio file partway in without
              trimming the source -- useful for syncing a music drop to a visual beat.
            </span>,
            <span>
              Multiple audio layers are mixed via <code>amix</code> at export. Single layers pass
              through directly to preserve maximum quality.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Hosted And Local Timeline Rules" tone="info">
        <GuideList
          items={[
            <span>
              Prompt-only still-image timeline runs can use the active account&apos;s OpenRouter
              still-image route.
            </span>,
            <span>
              Video generation, retakes, and sequence export continue to depend on the local
              backend and local generation path.
            </span>,
            <span>
              The export pipeline runs on the Python backend regardless of provider, so an offline
              backend always blocks export -- even for sequences full of OpenRouter-generated
              stills.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Sequence Export" tone="info">
        <GuideList
          items={[
            <span>
              Export MP4 renders exactly what the playback surface is previewing. If you set an
              in/out range, only that range is rendered; otherwise Vision Studio exports the full
              active sequence.
            </span>,
            <span>
              Encoding is H.264 video + AAC audio with <code>+faststart</code> moov placement, so
              exports begin streaming immediately in viewers and browsers.
            </span>,
            <span>
              Output paths can sit anywhere -- managed roots get tracked in Assets automatically;
              external locations stay openable and revealable through the export dialog.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
