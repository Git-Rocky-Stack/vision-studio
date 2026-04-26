import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function TimelineGuideSection() {
  return (
    <UserGuideSection
      id="guide-timeline"
      title="Timeline"
      summary="Review sequences, generate clip variants, approve retakes, and export the active edit."
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

      <GuideCallout title="Retake Workflow" tone="accent">
        <GuideList
          items={[
            <span>
              Mark <strong>Retake In</strong> and <strong>Retake Out</strong> from the timeline
              toolbar, then select the range in the inspector.
            </span>,
            <span>
              Use <strong>Generate Retake</strong> to create a candidate take for just that video
              segment. Candidate takes appear in both the inspector and the compare surface.
            </span>,
            <span>
              Accepting a take makes it the new current editorial version for playback and export.
              Reject removes it from consideration, and Revert restores the original clip range.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Hosted And Local Timeline Rules">
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
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Sequence Export">
        <p>
          Export MP4 renders exactly what the playback surface is previewing. If you set an in/out
          range, only that range is rendered; otherwise Vision Studio exports the full active
          sequence as a silent MP4.
        </p>
      </GuideCallout>
    </UserGuideSection>
  );
}
