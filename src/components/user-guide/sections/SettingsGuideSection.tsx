import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { GuideStepList } from '../GuideStepList';
import { UserGuideSection } from '../UserGuideSection';

export function SettingsGuideSection() {
  return (
    <UserGuideSection
      id="guide-settings"
      title="Settings"
      summary="Configure local accounts, BYOK routing, backend startup, models, output paths, tagging, appearance, and notifications."
    >
      <GuideList
        items={[
          <span>
            Settings is split across five tabs: <strong>General</strong>,{' '}
            <strong>AI &amp; Models</strong>, <strong>Appearance</strong>,{' '}
            <strong>Notifications</strong>, and <strong>User Guide</strong> (this document).
          </span>,
          <span>
            Use <strong>AI &amp; Models</strong> to start the backend, inspect GPU state, manage
            installed local models, and choose how the active account routes prompt tools and
            still images.
          </span>,
          <span>
            Changing the default output path restarts the backend so new local jobs write to the
            selected location.
          </span>,
        ]}
      />

      <GuideStepList
        steps={[
          {
            title: 'General -- set your output path and autosave',
            description:
              'Pick the default output path (where Local generations land) and toggle Autosave for projects. Changing the output path restarts the backend so new jobs land in the new location; existing assets remain reachable in their original root.',
          },
          {
            title: 'AI & Models -- start the backend and pick models',
            description:
              'Confirm Backend Autostart is on for normal use. Inspect GPU detection (CUDA version, VRAM). Browse installed models and download new ones -- large model downloads (10+ GB) run in the background and surface progress here.',
          },
          {
            title: 'AI & Models -- configure your account and BYOK routing',
            description:
              'Use User Accounts & BYOK to create or switch the active account. Per account, choose your prompt enhancement provider (Local or OpenRouter) and your still-image provider. Save your OpenRouter key, run Verify, and pick the prompt and still-image models you want hosted runs to use.',
          },
          {
            title: 'Appearance -- pick a theme',
            description:
              'Theme is Dark, Light, or System (follows your OS preference). The change is instant and persists per machine.',
          },
          {
            title: 'Notifications -- pick what you want to hear',
            description:
              'Toggle desktop notifications for Generation Complete, Generation Failed, and Model Downloads independently. Disabled types still log in the in-app activity but skip the OS toast.',
          },
        ]}
      />

      <GuideCallout title="User Accounts And BYOK" tone="accent">
        <GuideList
          items={[
            <span>
              Create, rename, switch, and remove local accounts without introducing mandatory
              cloud login. Each account is a self-contained profile.
            </span>,
            <span>
              Each local account stores its own encrypted OpenRouter key (sealed with the OS
              keychain via <code>safeStorage</code>), prompt model choice, and still-image model
              choice.
            </span>,
            <span>
              Only one account is active at a time, and that active account controls the hosted
              prompt and still-image route seen across the rest of the app.
            </span>,
            <span>
              Deleting an account also clears its stored key from the OS keychain. Switching
              accounts does not -- keys stay sealed for whenever you re-activate that account.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Connect To OpenRouter" tone="info">
        <GuideStepList
          steps={[
            {
              title: 'Paste your OpenRouter API key',
              description:
                'In the active account&apos;s BYOK panel, paste the key. It&apos;s stored encrypted via the OS keychain -- Vision Studio never logs the raw key and never returns it to the renderer.',
            },
            {
              title: 'Run Verify',
              description:
                'Verify hits OpenRouter to confirm access and load the model catalogs (text and image). On success, the catalog populates the prompt and still-image model pickers.',
            },
            {
              title: 'Pick your prompt and image models',
              description:
                'Select a chat-capable model for prompt enhancement and an image-capable model for still-image generation. The pickers only show models the verified key can actually access.',
            },
            {
              title: 'Watch your usage and credits',
              description:
                'After a verify, the panel shows current key metadata: remaining credits vs limit, total usage, BYOK usage, daily/weekly/monthly usage, and expiry. Re-run Verify any time to refresh.',
            },
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Local Models" tone="info">
        <GuideList
          items={[
            <span>
              Installed models are surfaced in the AI &amp; Models tab with name, size, and load
              state. The Local generation routes only see models that show as installed.
            </span>,
            <span>
              Downloads run in the background; closing Settings does not cancel them. Notifications
              fire on completion (gated by your Notification settings).
            </span>,
            <span>
              Deleting a model frees disk space immediately and removes it from the model picker.
              Re-download any time -- the catalog persists across uninstalls of the model itself.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Backend Health" tone="info">
        <GuideList
          items={[
            <span>
              The header surfaces backend status (running, port, GPU detected). The same status is
              visible in AI &amp; Models with full system info.
            </span>,
            <span>
              Use Start Backend if Autostart is off, the backend has been stopped manually, or a
              prior start failed. Stop Backend cleanly terminates the Python child process.
            </span>,
            <span>
              On Windows, the bundled backend is a PyInstaller one-file exe -- first launch can
              take several minutes to extract. Vision Studio surfaces a friendly modal with that
              hint if the readiness probe times out.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Verification And Usage Telemetry" tone="info">
        <p>
          After saving an OpenRouter key, run Verify to confirm access and load the model
          catalogs. Settings also shows current key metadata such as remaining credits, total
          usage, BYOK usage, and expiry when OpenRouter reports it. Verification runs are
          read-only and never charge against your account.
        </p>
      </GuideCallout>

      <GuideCallout title="Route Changes Affect The Whole Product" tone="warning">
        <GuideList
          items={[
            <span>
              <strong>Prompt provider</strong> changes affect Prompt Studio and prompt enhancement
              actions across Generate, Quick Generate, and Workflows.
            </span>,
            <span>
              <strong>Still-image provider</strong> changes affect Generate, Quick Generate,
              Batch, Workflow still-image runs, and supported timeline still-image actions.
            </span>,
            <span>
              <strong>Video remains local-only</strong> regardless of routing -- there is no
              hosted video equivalent today.
            </span>,
            <span>
              Switching the active account is the canonical way to change provider routing for
              everyone using this install. The change takes effect immediately; in-flight jobs
              continue on their original route.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
