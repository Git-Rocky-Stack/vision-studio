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
            for prompt sets, and <strong>Prompt Studio</strong> when you want to refine a prompt
            before launching.
          </span>,
          <span>
            The main Generate panel can target the active timeline clip, so completed results can
            land directly in the edit instead of staying detached from the story flow.
          </span>,
          <span>
            Completed jobs are added to the asset library and show up in Viewer, so hosted and
            local results stay reviewable in the same place.
          </span>,
        ]}
      />

      <GuideStepList
        steps={[
          {
            title: 'Write or paste your prompt',
            description:
              'Choose Image or Video at the top of the panel, then write in the Prompt card. Open Negative prompt under the prompt toolbar for things to avoid. The toolbar can randomize a starter prompt, AI-enhance it, open prompt history, save it to favorites, or copy it.',
          },
          {
            title: 'Pick a model and aspect ratio',
            description:
              'Pick an installed model in Style + Model, then set the aspect ratio in the Output card. The aspect ratio drives width and height together, and the card shows the resulting size and an estimated run time.',
          },
          {
            title: 'Tune Advanced settings if you need to',
            description:
              'Open the Advanced card to override steps, CFG scale, scheduler, and seed. The defaults are 25 steps, CFG 7.5, the Euler a scheduler, and a random seed (-1).',
          },
          {
            title: 'Add references and LoRAs when the run needs them',
            description:
              'Use Reference Inputs for composition or character continuity, Control Layers (image) or Motion (video) for the LoRA mixer, and canvas control layers for structural guidance such as ControlNet. These advanced inputs require the Local route, with one narrow exception: a single FLUX LoRA from the HuggingFace Hub at weight 1.0 can ride the HuggingFace still-image route.',
          },
          {
            title: 'Generate and review',
            description:
              'Click Generate. Progress shows in the panel and the job list. When the job lands, the result is added to the asset library and is ready in Viewer.',
          },
        ]}
      />

      <GuideCallout title="Quick Generate vs Generate" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Quick Generate</strong> is the fast still-image draft surface: a prompt, a
              negative prompt, and minimal controls, for exploring ideas before committing to a
              full setup.
            </span>,
            <span>
              <strong>Generate</strong> is the full panel: references, LoRAs, advanced settings,
              video controls, and timeline-aware targeting.
            </span>,
            <span>
              Both follow the same active account routing and write to the same asset library.
              Quick Generate keeps its own prompt fields; it does not share the Generate draft.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Understanding the Controls" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Model</strong> drives both quality and capability. The picker lists the
              installed models for the current type; video models such as LTX-Video and SVD appear
              when the panel is set to Video.
            </span>,
            <span>
              <strong>Steps</strong> trade speed for refinement. Most modern models converge by
              step 20-30; pushing past 50 rarely improves still results and costs time.
            </span>,
            <span>
              <strong>CFG Scale</strong> controls how strictly the model follows your prompt.
              Lower values give the model creative latitude; higher values force literal adherence
              and can introduce artifacts.
            </span>,
            <span>
              <strong>Scheduler</strong> selects the sampler: Euler, Euler a (the default), DPM++
              2M, DPM++ 2M Karras, DPM++ SDE, DPM++ SDE Karras, DDIM, or UniPC.
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
              <strong>AI Enhance</strong> and <strong>Expand</strong> edit the Prompt Studio draft,
              which feeds the Generate panel, rather than a disconnected editor.
            </span>,
            <span>
              <strong>Negative Suggest</strong> uses the active account&apos;s prompt provider
              (OpenRouter or HuggingFace), and falls back to built-in heuristics covering portrait,
              photo, text, product, landscape, and anime cues on the Local route.
            </span>,
            <span>
              <strong>Style Transfer</strong> opens the style presets, which add or remove real
              modifiers on the draft prompt.
            </span>,
            <span>
              Prompt history keeps the most recent 50 prompts on this machine. Save a prompt to
              favorites (the heart) and filter the history to favorites to find it again.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="AI Director (Grounded Prompt Assist)" tone="info">
        <GuideList
          items={[
            <span>
              Enable <strong>AI Director (RAG)</strong> in Settings &gt; AI &amp; Models to ground
              prompt enhancement in your own context. Pick the sources (your prior prompts, your
              asset library, the model-prompting knowledge base), then use Rebuild index.
            </span>,
            <span>
              With the Director on, Prompt Studio reports{' '}
              <strong>Context used: N references</strong> for an assisted prompt, with a{' '}
              <code>(lexical match)</code> note when it falls back from semantic to keyword
              retrieval.
            </span>,
            <span>
              The index is built on this machine and is optional. When prompt assist runs on a
              hosted route, the retrieved excerpts are sent to that provider with your prompt.
              Rebuild or clear the index from Settings as your material changes.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Batch Generation" tone="info">
        <GuideList
          items={[
            <span>
              Each prompt gets its own card: use <strong>Add Prompt</strong> for another card, or{' '}
              <strong>Variations</strong> to add variations of the last prompt. Empty cards are
              skipped. Every prompt becomes a separate job with the shared size, model, steps, and
              CFG settings.
            </span>,
            <span>
              Results collect in the batch workspace, where you can sort them, filter by All,
              Completed, Failed, or Favorites, and use Export All or Delete All.
            </span>,
            <span>
              Cards keep their order and show each prompt&apos;s status, so you can see which
              prompt produced which result. A failed prompt is marked failed; there is no retry
              control, so run it again from a new batch.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Hosted Still-Image Routes" tone="accent">
        <GuideList
          items={[
            <span>
              When the active account uses OpenRouter or HuggingFace for still images, Generate,
              Quick Generate, and Batch send the prompt to the configured hosted still-image model
              instead of the local backend.
            </span>,
            <span>
              Hosted still-image runs from Generate and Batch can continue even while the local
              backend is offline, as long as the active account has a stored key or token and a
              still-image model selected. Quick Generate only runs without the backend on the
              OpenRouter route.
            </span>,
            <span>
              OpenRouter results are written to <code>&lt;output root&gt;/openrouter/YYYY-MM-DD/</code>{' '}
              under your output folder, then synced into Assets. There is no separate hosted
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
              and non-FLUX families all stay Local, and OpenRouter has no LoRA support at all.
            </span>,
            <span>
              <strong>Video generation runs locally or through HuggingFace</strong> depending on
              the active account&apos;s video provider. OpenRouter has no video route, and hosted
              video runs are prompt-only.
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
              Before a Local still-image run, Vision Studio checks whether the selected model is
              likely to fit in VRAM. If it is <strong>over your GPU budget</strong>, a dialog warns
              you instead of letting the run fail with an out-of-memory error mid-generation.
            </span>,
            <span>
              From that dialog you can <strong>route the run to a configured hosted provider</strong>{' '}
              (OpenRouter or HuggingFace, if the active account has one set up),{' '}
              <strong>run locally anyway</strong> (accepting the OOM risk), or cancel. Turn on
              auto-routing under Over-Budget Policy in Settings to skip the dialog.
            </span>,
            <span>
              If no hosted provider can handle the request, the dialog says so and points you to
              add a key and model in Settings. It never silently downgrades or drops the job.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
