import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { GuideStepList } from '../GuideStepList';
import { UserGuideSection } from '../UserGuideSection';

export function SettingsGuideSection() {
  return (
    <UserGuideSection
      id="guide-settings"
      title="Settings"
      summary="Configure output paths, backend startup, local accounts, BYOK routing, GPU acceleration, appearance, and notifications."
    >
      <GuideList
        items={[
          <span>
            Settings is split across seven tabs: <strong>General</strong>,{' '}
            <strong>AI &amp; Models</strong>, <strong>Performance</strong>,{' '}
            <strong>Appearance</strong>, <strong>Notifications</strong>,{' '}
            <strong>User Guide</strong> (this document), and <strong>About</strong>.
          </span>,
          <span>
            Use <strong>AI &amp; Models</strong> to inspect GPU state, start the backend when it is
            offline, and choose how the active account routes prompt tools, still images, and
            video. Model downloads and management live in the <strong>Foundry</strong>; the
            Installed Models card here links to it with <strong>Manage in Foundry</strong>.
          </span>,
          <span>
            Changing the default output folder restarts the backend so new local jobs write to the
            selected location.
          </span>,
        ]}
      />

      <GuideStepList
        steps={[
          {
            title: 'General: output path, autosave, backend autostart',
            description:
              'Pick the Default Output Location with Browse, toggle Auto Save for local project state, and keep Backend Autostart on for normal use. Changing the output folder restarts the backend; existing assets stay reachable in their original root. Storage Usage shows the library size and offers Clear Cache.',
          },
          {
            title: 'AI & Models: GPU and backend',
            description:
              'The GPU card shows the detected GPU, VRAM, and CUDA version (or CPU mode). When the backend is offline, an AI Backend Offline card appears with a Start Backend button.',
          },
          {
            title: 'AI & Models: account and BYOK routing',
            description:
              'Use User Accounts & BYOK to create, rename, switch, or remove the active account. Per account, choose the Prompt Enhancement Provider, the Still Image Provider, and the Motion / Video Provider (each Local, OpenRouter, or HuggingFace, except that OpenRouter has no video). Save an OpenRouter key and a HuggingFace token, and pick the models hosted runs should use.',
          },
          {
            title: 'AI & Models: over-budget policy, tagging, and AI Director',
            description:
              'Over-Budget Policy picks a fallback provider for local runs projected to exceed your GPU budget and can auto-route them without asking. AI Tagging Mode controls when assets are tagged. AI Director (RAG) grounds prompt assist in your prompts, assets, and a model-prompting knowledge base.',
          },
          {
            title: 'Performance: tune acceleration for your GPU',
            description:
              'The Performance tab has a Master Enable switch plus a tri-state control (Auto, On, Off) for Compile, Quantization, SDPA, Channels Last, Attention Slicing, and TensorRT. After a Local generation, the panel shows what was applied, skipped, or fell back on that run.',
          },
          {
            title: 'Appearance: pick a theme',
            description:
              'Theme is Dark, Light, or System (follows your OS preference). The change applies immediately and is saved with your settings.',
          },
          {
            title: 'Notifications: pick what you want to hear',
            description:
              'Toggle desktop notifications for Generation Complete, Generation Failed, and Model Downloads independently. A disabled type simply skips the OS notification.',
          },
        ]}
      />

      <GuideCallout title="User Accounts And BYOK" tone="accent">
        <GuideList
          items={[
            <span>
              Create, rename, switch, and remove local accounts without any cloud login. Each
              account is a self-contained profile.
            </span>,
            <span>
              Each local account stores its own OpenRouter API key and HuggingFace token, encrypted
              with the operating system&apos;s secure storage (Electron <code>safeStorage</code>)
              and kept in the main process, plus its own prompt, still-image, and video model
              choices.
            </span>,
            <span>
              Only one account is active at a time, and that active account controls the prompt,
              still-image, and video routes seen across the rest of the app.
            </span>,
            <span>
              Removing an account deletes its stored key and token. Switching accounts does not;
              they stay stored for whenever you re-activate that account.
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
                "In the active account's OpenRouter API Key panel, paste the key and choose Save Key. The key is encrypted and stays in the main process; Vision Studio never returns it to the renderer.",
            },
            {
              title: 'Run Verify',
              description:
                'Verify checks the key with OpenRouter and loads the model catalogs. The prompt catalog is filtered to text models that support JSON responses; the still-image catalog to models that output images.',
            },
            {
              title: 'Pick your prompt and image models',
              description:
                'Select a prompt model (or leave the account default) and a still-image model. Use Refresh next to either picker to reload its catalog.',
            },
            {
              title: 'Watch your usage and credits',
              description:
                'Key Usage shows Credit Remaining, Total Usage, BYOK Usage, and Tier & Expiry for the stored key. Use Refresh Usage at any time to reload it.',
            },
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Connect To HuggingFace" tone="info">
        <GuideList
          items={[
            <span>
              Paste a HuggingFace access token in the HuggingFace Inference Token panel and choose
              Save Token. The panel then reads <strong>Token stored</strong>; Clear removes it.
            </span>,
            <span>
              Pick a still-image model (FLUX.1 schnell or SDXL 1.0), a video model (LTX-Video), and
              a prompt model (Qwen 2.5 7B Instruct by default, or Llama 3.1 8B Instruct, which is
              gated on huggingface.co).
            </span>,
            <span>
              The HuggingFace provider buttons stay disabled until a token is stored.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Local Models" tone="info">
        <GuideList
          items={[
            <span>
              The Installed Models card in AI &amp; Models shows how many models are installed.
              Discover, download, convert, and delete models in the <strong>Foundry</strong>.
            </span>,
            <span>
              The Local generation routes only offer models that are installed. When none are,
              the model picker points you to the Foundry.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Backend Health" tone="info">
        <GuideList
          items={[
            <span>
              The header shows a backend status pill (offline, warming, ready, GPU or CPU mode).
              The GPU card in AI &amp; Models shows the detected GPU, VRAM, and CUDA version.
            </span>,
            <span>
              Use Start Backend in AI &amp; Models when Autostart is off or a start failed. There
              is no Stop Backend control; the backend stops when you quit the app.
            </span>,
            <span>
              If the bundled backend does not start in time on launch, Vision Studio shows a
              Backend Not Started dialog. The first launch can take several minutes while the
              bundled backend extracts.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="GPU Acceleration" tone="info">
        <GuideList
          items={[
            <span>
              The <strong>Performance</strong> tab tunes how Local generations use your GPU. Master
              Enable turns acceleration on or off; each optimization is tri-state
              (<strong>Auto</strong>, <strong>On</strong>, <strong>Off</strong>).
            </span>,
            <span>
              Covered optimizations: torch.compile, quantization, SDPA attention, channels-last
              memory format, attention slicing, and the TensorRT engine path. Auto lets Vision
              Studio pick what fits your hardware; On and Off override one optimization.
            </span>,
            <span>
              After a Local run the panel reports what was <strong>Applied</strong>,{' '}
              <strong>Skipped</strong>, or <strong>Fell Back</strong> on that run.
            </span>,
            <span>
              Under Auto, TensorRT stays off; set it to On to build an engine explicitly.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Route Changes Affect The Whole Product" tone="warning">
        <GuideList
          items={[
            <span>
              <strong>Prompt provider</strong> changes affect Prompt Studio and the prompt
              enhancement actions.
            </span>,
            <span>
              <strong>Still-image provider</strong> changes affect Generate, Quick Generate,
              Batch, Workflow still-image runs, and supported timeline still-image actions.
            </span>,
            <span>
              <strong>Video provider</strong> changes affect Generate video runs and timeline video
              actions such as retakes and Extend Shot. Video runs Local or through HuggingFace;
              OpenRouter has no video route.
            </span>,
            <span>
              Switching the active account is the way to change every route at once for this
              install.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
