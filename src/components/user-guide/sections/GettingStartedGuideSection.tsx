import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { GuideStepList } from '../GuideStepList';
import { UserGuideSection } from '../UserGuideSection';

export function GettingStartedGuideSection() {
  return (
    <UserGuideSection
      id="guide-start-here"
      title="Start Here"
      summary="Set up one local account, pick your provider routes, and decide which parts of production stay local versus hosted."
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
              'Set Prompt Enhancement Provider to Local for the built-in prompt heuristics, or to OpenRouter or HuggingFace when you want BYOK prompt enhancement in Prompt Studio and the Enhance Prompt actions.',
          },
          {
            title: 'Decide how still images should run',
            description:
              'Set Still Image Provider to Local for the full canvas-aware toolset, or to OpenRouter or HuggingFace for hosted prompt-only still-image runs across Generate, Quick Generate, Batch, Workflows, and supported timeline still-image actions.',
          },
          {
            title: 'Decide how video should run',
            description:
              'Set Motion / Video Provider to Local for the installed video stack, or to HuggingFace for hosted prompt-only video. OpenRouter does not offer video, so that option is disabled.',
          },
          {
            title: 'Save your key or token if you use BYOK',
            description:
              'For OpenRouter, paste the API key, save it, run Verify, then pick the prompt and still-image models and check the credits and usage readout. For Hugging Face, save the access token, then pick the still-image, video, and prompt models. HuggingFace options stay disabled until a token is stored.',
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
              <strong>Local</strong> is the full-fidelity production path for ControlNet, inpaint,
              reference-image passes, canvas-guided generation, multi-LoRA runs, and the installed
              model stack.
            </span>,
            <span>
              <strong>OpenRouter</strong> is a BYOK hosted path for prompt tooling and prompt-only
              still images. It has no video route.
            </span>,
            <span>
              <strong>HuggingFace</strong> is a BYOK hosted path for prompt tooling, prompt-only
              still images, and prompt-only video.
            </span>,
            <span>
              A configured hosted route keeps working while the local backend is offline. The
              active account controls every route, so switching accounts changes the prompt,
              still-image, and video providers used by the rest of the app.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Current Hosted Boundary" tone="warning">
        <p>
          Hosted routes are prompt-only. ControlNet, inpaint, canvas reference passes, and
          reference-image passes stay on the Local route, and LoRAs only leave Local in one narrow
          HuggingFace case (see Generate). Timeline export always runs on the local backend.
        </p>
      </GuideCallout>
    </UserGuideSection>
  );
}
