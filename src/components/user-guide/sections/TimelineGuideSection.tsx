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
            The Timeline sits under the canvas on the Generate tab. Use the playback surface to
            review the active sequence, play range, speed, and loop state before you export.
          </span>,
          <span>
            The Clip Inspector handles timing edits, transitions, split and duplicate actions,
            track moves, retake ranges, and AI clip actions for clips that have a generation
            binding.
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
              'Use Build Timeline in Story to create or reuse the project sequence automatically, or use Add Clip in the timeline toolbar to place the selected media on the timeline.',
          },
          {
            title: 'Navigate with the keyboard and transport',
            description:
              'Space plays or pauses. Home and End jump to the start and end of the play range (or the sequence). Left and Right seek 250 ms; hold Shift to seek 1 second. Loop and speed controls sit with the transport.',
          },
          {
            title: 'Set an in/out range',
            description:
              'Use the Mark In and Mark Out buttons in the timeline toolbar to scope playback and export to a range. Clear the range with the Clear Range button. These are toolbar buttons; they have no keyboard shortcut.',
          },
          {
            title: 'Edit clips with the Clip Inspector',
            description:
              'Select a clip to load it in the Clip Inspector. Edit its label, track, start, and duration, trim the start or end to the playhead, move it a frame Earlier or Later, and set in and out transitions. With a clip selected, S splits it at the playhead, Ctrl/Cmd+D duplicates it, Alt+Left or Alt+Right nudges it one frame, and Delete or Backspace deletes it after a confirmation.',
          },
          {
            title: 'Add and balance audio layers',
            description:
              'Put audio clips on an audio track. Set gain (0 to 200 percent), fade in, and fade out in milliseconds on the selected audio clip, and trim its start to the playhead to begin partway into the file. The mix plays during preview and is rendered into the export.',
          },
          {
            title: 'Export when ready',
            description:
              'Use Export MP4. The dialog summarizes the scope, range, and frame size before encoding. A successful export offers Open MP4 and a reveal action for files saved in your managed output folder or in Desktop, Documents, Downloads, Pictures, or Videos.',
          },
        ]}
      />

      <GuideCallout title="Retake Workflow" tone="accent">
        <GuideStepList
          steps={[
            {
              title: 'Mark the retake range',
              description:
                'Retakes work on video clips. Use Retake In and Retake Out in the timeline toolbar, then create the range. The range appears in the inspector, where you can fine-tune its in and out times or clear it.',
            },
            {
              title: 'Generate a candidate take',
              description:
                'In the inspector, select the range and use Generate Retake. The original clip stays intact while the new take generates through the active video route.',
            },
            {
              title: 'Compare candidates',
              description:
                'Candidate takes are listed under the range, and the compare surface plays the original against a candidate. Several takes can stack on one range; keep generating until one feels right.',
            },
            {
              title: 'Accept, reject, or revert',
              description:
                'Accept makes a take the editorial version for playback and export. Reject marks a take as rejected. Revert, available once a take is accepted, returns the range to the original clip and keeps the takes as candidates.',
            },
          ]}
        />
      </GuideCallout>

      <GuideCallout title="AI Clip Actions" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Regenerate In Place</strong> re-runs the clip&apos;s generation to refresh it
              without changing its place on the timeline.
            </span>,
            <span>
              <strong>Create Variant</strong> runs a new job from the same binding, so you get
              options without losing the current take.
            </span>,
            <span>
              <strong>Extend Shot</strong> lengthens a motion clip by generating more footage. It
              is only available for video clips.
            </span>,
            <span>
              All three actions need a generation binding (the clip was generated from the main
              panel). Clips without one show a prompt to generate from the main panel first.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Audio Mixing" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Gain</strong> runs from 0 to 200 percent. Anything past 100 amplifies, so
              watch peaks if you mix loud sources.
            </span>,
            <span>
              <strong>Fade In</strong> and <strong>Fade Out</strong> are set in milliseconds and
              applied as a volume curve at export time, not just during preview.
            </span>,
            <span>
              Multiple audio layers are mixed with <code>amix</code> at export; a single layer
              passes through on its own.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Hosted And Local Timeline Rules" tone="info">
        <GuideList
          items={[
            <span>
              Still-image timeline runs follow the active account&apos;s still-image provider
              (Local, OpenRouter, or HuggingFace).
            </span>,
            <span>
              Video runs, retakes, and Extend Shot follow the active account&apos;s video provider
              (Local or HuggingFace). Hosted routes keep working while the local backend is
              offline.
            </span>,
            <span>
              Sequence export always runs on the local backend, so an offline backend blocks
              export even for sequences made entirely of hosted output.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Sequence Export" tone="info">
        <GuideList
          items={[
            <span>
              Export MP4 renders what the playback surface previews. If you set an in/out range,
              only that range is rendered; otherwise the full active sequence is exported.
            </span>,
            <span>
              Video is encoded as H.264 MP4. When the sequence has audio, it is mixed to AAC and
              the file is written with <code>+faststart</code> so it starts playing immediately.
            </span>,
            <span>
              The destination must be an <code>.mp4</code> file in a folder that already exists.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
