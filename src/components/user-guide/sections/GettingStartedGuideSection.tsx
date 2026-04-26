import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { GuideStepList } from '../GuideStepList';
import { UserGuideSection } from '../UserGuideSection';

export function GettingStartedGuideSection() {
  return (
    <UserGuideSection
      id="guide-start-here"
      title="Start Here"
      summary="Set up one local account, pick your provider route, and decide which parts of production stay local versus hosted."
    >
      <GuideStepList
        steps={[
          {
            title: 'Create or select a local account',
            description:
              'Open Settings > AI & Models, then use User Accounts & BYOK to create a profile for yourself or for a separate client, brand, or workflow.',
          },
          {
            title: 'Decide how prompts should run',
            description:
              'Choose Local for on-device prompt tools, or switch Prompt Enhancement to OpenRouter when you want BYOK prompt enhancement in Prompt Studio and Enhance Prompt actions.',
          },
          {
            title: 'Decide how still images should run',
            description:
              'Set Still Image Provider to Local for the full canvas-aware toolset, or OpenRouter for hosted prompt-only still-image runs across Generate, Quick Generate, Batch, Workflows, and supported timeline still-image actions.',
          },
          {
            title: 'Save and verify your OpenRouter key if you use BYOK',
            description:
              'Paste the API key, save it, run Verify, then confirm the prompt model, still-image model, remaining credits, usage, and expiry state for the active account.',
          },
          {
            title: 'Start your first production pass',
            description:
              'Generate a still or motion clip, review it in Viewer, push scenes to Story or Timeline when needed, and keep final outputs organized in Assets and Collections.',
          },
        ]}
      />

      <GuideCallout title="Provider Routing At A Glance" tone="accent">
        <GuideList
          items={[
            <span>
              <strong>Local</strong> is the full-fidelity production path for video, ControlNet,
              inpaint, reference-image passes, canvas-guided generation, timeline export, and the
              installed model stack.
            </span>,
            <span>
              <strong>OpenRouter</strong> is the BYOK hosted path for prompt tooling and prompt-only
              still-image generation. When configured, it can keep still-image workflows moving even
              if the local backend is offline.
            </span>,
            <span>
              The active account controls both routes. Switching accounts changes the prompt and
              still-image provider used by the rest of the app.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Current Hosted Boundary" tone="warning">
        <p>
          OpenRouter currently covers prompt tooling plus prompt-only still-image jobs. Video
          generation, retake generation, ControlNet, inpaint, canvas reference passes, and timeline
          export remain local-only.
        </p>
      </GuideCallout>
    </UserGuideSection>
  );
}
