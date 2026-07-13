import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { GuideStepList } from '../GuideStepList';
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
            Completed jobs route back through Viewer and the asset library, so hosted and local
            stills stay reviewable in the same workspace flow.
          </span>,
        ]}
      />

      <GuideStepList
        steps={[
          {
            title: 'Write or paste your prompt',
            description:
              'Use the prompt area at the top of Generate. Press Tab to jump into the negative prompt field, or use the Random button in the toolbar to seed a starter idea when you want a blank-canvas warm-up.',
          },
          {
            title: 'Pick a model and aspect ratio',
            description:
              'Select an installed image or video model from the Model picker, then set the aspect ratio. Aspect ratio drives width and height together, so the picker keeps proportions correct without manual math.',
          },
          {
            title: 'Tune Advanced Settings if you need to',
            description:
              'Open Advanced Generation Settings to override steps, CFG scale, scheduler, and seed. The defaults (25 steps, CFG 7.5, Euler scheduler, random seed) are tuned to be a good starting point for most models.',
          },
          {
            title: 'Add references, ControlNet, or LoRA when the run needs them',
            description:
              'Use Reference Media for composition or character continuity, ControlNet for structural guidance, and LoRA Mixer for style fine-tunes. These advanced inputs require the Local still-image route, with one narrow exception: a single FLUX LoRA from the HuggingFace Hub at weight 1.0 can ride the HuggingFace route -- see the routing callout below.',
          },
          {
            title: 'Generate and review',
            description:
              'Click Generate. Track progress in the active jobs list and in the live progress overlay. When the job lands, the result opens in Viewer and is added to the asset library automatically.',
          },
        ]}
      />

      <GuideCallout title="Quick Generate vs Generate" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Quick Generate</strong> is the fast still-image draft surface -- minimal
              controls, immediate results, ideal for exploring ideas before committing to a full
              setup.
            </span>,
            <span>
              <strong>Generate</strong> is the full panel -- references, ControlNet, LoRA, advanced
              settings, video controls, and timeline-aware targeting.
            </span>,
            <span>
              Both share the same draft, the same active account routing, and the same asset
              destinations. Switching between them never loses prompt state.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Understanding the Controls" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Model</strong> drives both quality and capability. FLUX models excel at
              photorealism and prompt adherence; SD 3.5 is a balanced workhorse; SD 1.5 is fastest
              and most permissive about VRAM. Video models (LTX, SVD, AnimateDiff) appear when
              Generation Type is set to Video.
            </span>,
            <span>
              <strong>Steps</strong> trade speed for refinement. Most modern models converge by
              step 20-30; pushing past 50 rarely improves still results and burns time.
            </span>,
            <span>
              <strong>CFG Scale</strong> controls how strictly the model follows your prompt.
              Lower (3-5) gives the model creative latitude; higher (8-12) forces literal
              adherence and can introduce artifacts above 12.
            </span>,
            <span>
              <strong>Scheduler</strong> selects the sampler. Euler and DPM++ are reliable
              defaults; experiment per model to find your taste.
            </span>,
            <span>
              <strong>Seed</strong> at <code>-1</code> is random. Lock a seed when you want to
              re-roll a variation while keeping the composition close to the previous result.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Prompt Studio" tone="info">
        <GuideList
          items={[
            <span>
              <strong>AI Enhance</strong> and <strong>Expand</strong> operate on the shared
              generation draft instead of a disconnected local editor.
            </span>,
            <span>
              <strong>Negative Suggest</strong> uses OpenRouter when the active account selects the
              hosted prompt route, with a built-in heuristic fallback (covering portrait, photo,
              text, product, landscape, and anime cues) when OpenRouter is not selected.
            </span>,
            <span>
              <strong>Style Transfer</strong> applies real preset modifiers to the draft prompt,
              so the generated result reflects the selected style chips immediately.
            </span>,
            <span>
              Prompt history is capped to the most recent 50 prompts and stays local to the
              renderer. Star a prompt from the history list to keep it pinned across sessions.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="AI Director (Grounded Prompt Assist)" tone="info">
        <GuideList
          items={[
            <span>
              Enable <strong>AI Director (RAG)</strong> in Settings &gt; AI &amp; Models to ground
              prompt enhancement in your own context. Add sources, then build the retrieval index
              so Enhance and Expand pull in relevant detail instead of guessing.
            </span>,
            <span>
              With the Director on, Prompt Studio reports{' '}
              <strong>Context used: N references</strong> for an assisted prompt, with a{' '}
              <code>(lexical match)</code> note when it falls back from semantic to keyword
              retrieval. You always see exactly which references shaped the prompt.
            </span>,
            <span>
              Retrieval is local to your machine and entirely optional; with the Director off,
              prompt tools behave exactly as before. Rebuild or clear the index any time from
              Settings as your source material changes.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Batch Generation" tone="info">
        <GuideList
          items={[
            <span>
              Paste or type one prompt per line. Empty lines are ignored. Each prompt becomes a
              separate job using the shared aspect, model, and advanced settings.
            </span>,
            <span>
              Active jobs queue up under one batch. Completed results bulk into the batch
              workspace where you can preview, multi-select, bulk export, or bulk delete without
              context-switching back to Assets.
            </span>,
            <span>
              The batch UI preserves prompt order so you can spot which prompt produced which
              result. Failed prompts stay in the batch with a retry control instead of disappearing
              silently.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="OpenRouter Still-Image Route" tone="accent">
        <GuideList
          items={[
            <span>
              When the active account uses OpenRouter for still images, Generate, Quick Generate,
              and Batch route prompt, negative prompt, aspect ratio, and seed through the
              configured hosted still-image model.
            </span>,
            <span>
              Hosted still-image runs can continue even while the local backend is offline, as
              long as the active account has a verified key and a still-image model selected.
            </span>,
            <span>
              Hosted results are written into <code>output/openrouter/YYYY-MM-DD/</code> under
              your managed output root, then synced into Assets -- there is no separate hosted
              gallery to chase.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Switch Back To Local When You Need Advanced Image Controls" tone="warning">
        <GuideList
          items={[
            <span>
              ControlNet, inpaint, canvas-guided layers, and reference-image passes remain on the
              local image path.
            </span>,
            <span>
              <strong>LoRAs are Local-first.</strong> The one hosted exception: exactly one
              FLUX-family LoRA with a HuggingFace Hub repo, at weight 1.0, can run on the
              HuggingFace still-image route. Multiple LoRAs, custom weights, local-only files,
              and non-FLUX families all stay Local, and OpenRouter has no LoRA contract at all.
            </span>,
            <span>
              <strong>Video generation runs locally or through HuggingFace</strong> depending on
              the active account&apos;s video provider. OpenRouter has no video equivalent today,
              and hosted video runs are prompt-only.
            </span>,
            <span>
              If those controls matter for the current run, switch the active account&apos;s
              still-image provider back to Local in Settings before launching, or switch to a
              different account that is already configured for Local.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Over-Budget Fallback" tone="warning">
        <GuideList
          items={[
            <span>
              Before a Local run, Vision Studio checks whether the selected model is likely to fit
              in VRAM. If it is <strong>over your GPU budget</strong>, a dialog warns you instead of
              letting the run fail with an out-of-memory error mid-generation.
            </span>,
            <span>
              From that dialog you can <strong>route the run to a configured hosted provider</strong>{' '}
              (OpenRouter or HuggingFace, if the active account has one set up),{' '}
              <strong>run locally anyway</strong> (accepting the OOM risk), or cancel.
            </span>,
            <span>
              If no hosted provider is configured to handle the request, the dialog says so and
              points you to add a key and model in Settings -- it never silently downgrades or
              drops the job.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
