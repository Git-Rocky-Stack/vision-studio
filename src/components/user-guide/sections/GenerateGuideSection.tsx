import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function GenerateGuideSection() {
  return (
    <UserGuideSection
      id="guide-generate"
      title="Generate"
      summary="Create stills and motion, route jobs through the active provider, and move finished work into Viewer, Timeline, and Assets."
    >
      <GuideList
        items={[
          <span>
            Use <strong>Generate</strong> for full image and video controls,{' '}
            <strong>Quick Generate</strong> for fast still drafts, <strong>Batch Generation</strong>{' '}
            for prompt sets, and <strong>Prompt Studio</strong> when you want to refine the shared
            draft before launching.
          </span>,
          <span>
            The main Generate panel can target the current timeline sequence or clip, so completed
            results can land directly in the edit instead of staying detached from the story flow.
          </span>,
          <span>
            Completed jobs still route back through Viewer and the asset library, so hosted and
            local stills stay reviewable in the same workspace flow.
          </span>,
        ]}
      />

      <GuideCallout title="Prompt Studio">
        <GuideList
          items={[
            <span>
              <strong>AI Enhance</strong> and <strong>Expand</strong> now operate on the shared
              generation draft instead of a disconnected local editor.
            </span>,
            <span>
              <strong>Negative Suggest</strong> uses OpenRouter when the active account selects the
              hosted prompt route, with a local fallback when OpenRouter is not selected.
            </span>,
            <span>
              <strong>Style Transfer</strong> applies real preset modifiers to the draft prompt,
              so the generated result reflects the selected style chips immediately.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="OpenRouter Still-Image Route" tone="accent">
        <GuideList
          items={[
            <span>
              When the active account uses OpenRouter for still images, Generate, Quick Generate,
              and Batch route prompt, negative prompt, aspect ratio, and seed through the configured
              hosted still-image model.
            </span>,
            <span>
              Hosted still-image runs can continue even while the local backend is offline, as long
              as the active account has a verified key and a still-image model selected.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Switch Back To Local When You Need Advanced Image Controls" tone="warning">
        <p>
          ControlNet, inpaint, canvas-guided layers, and reference-image passes remain on the local
          image path. If those controls matter for the current run, switch the active account&apos;s
          still-image provider back to Local in Settings before launching.
        </p>
      </GuideCallout>
    </UserGuideSection>
  );
}
