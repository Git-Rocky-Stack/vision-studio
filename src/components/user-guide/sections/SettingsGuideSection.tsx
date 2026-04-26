import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function SettingsGuideSection() {
  return (
    <UserGuideSection
      id="guide-settings"
      title="Settings"
      summary="Configure local accounts, BYOK routing, backend startup, models, output paths, tagging, and notifications."
    >
      <GuideList
        items={[
          <span>
            Use <strong>AI &amp; Models</strong> to start the backend, inspect GPU state, manage
            installed local models, and choose how the active account routes prompt tools and still
            images.
          </span>,
          <span>
            Changing the default output path restarts the backend so new local jobs write to the
            selected location.
          </span>,
          <span>
            Notification settings control desktop alerts for completed jobs, failed jobs, and model
            downloads, while tagging controls determine how aggressively Vision Studio annotates new
            assets.
          </span>,
        ]}
      />

      <GuideCallout title="User Accounts And BYOK" tone="accent">
        <GuideList
          items={[
            <span>
              Create, rename, switch, and remove local accounts without introducing mandatory cloud
              login.
            </span>,
            <span>
              Each local account stores its own encrypted OpenRouter key, prompt model choice, and
              still-image model choice.
            </span>,
            <span>
              Only one account is active at a time, and that active account controls the hosted
              prompt and still-image route seen across the rest of the app.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Verification And Usage Telemetry">
        <p>
          After saving an OpenRouter key, run Verify to confirm access and load the model catalogs.
          Settings also shows current key metadata such as remaining credits, total usage, BYOK
          usage, and expiry when OpenRouter reports it.
        </p>
      </GuideCallout>

      <GuideCallout title="Route Changes Affect The Whole Product" tone="warning">
        <p>
          Prompt provider changes affect Prompt Studio and prompt enhancement actions. Still-image
          provider changes affect Generate, Quick Generate, Batch, Workflow still-image runs, and
          supported timeline still-image actions. Video remains local-only.
        </p>
      </GuideCallout>
    </UserGuideSection>
  );
}
