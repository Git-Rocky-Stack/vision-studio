import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { GuideStepList } from '../GuideStepList';
import { UserGuideSection } from '../UserGuideSection';

export function WorkflowsGuideSection() {
  return (
    <UserGuideSection
      id="guide-workflows"
      title="Workflows"
      summary="Build node graphs, validate real execution requests, run repeatable still-image jobs, and pair with Pipelines for refinement chains."
    >
      <GuideList
        items={[
          <span>
            Use <strong>Workflows</strong> for node graph authoring, validation, and still-image
            execution. Graphs can be exported as ComfyUI API JSON, imported from it, or run on a
            ComfyUI server.
          </span>,
          <span>
            <strong>Validate</strong> previews the resolved request for the active workflow
            (model, size, steps, CFG, and prompt) and lists any execution issues before you run
            it.
          </span>,
          <span>
            The Run Output list records the active workflow&apos;s recent runs, so you can see
            which execution completed, failed, or is still in progress.
          </span>,
        ]}
      />

      <GuideStepList
        steps={[
          {
            title: 'Pick a workflow',
            description:
              'The Workflow Library lists your saved workflows. Click one to load its node graph. A graph imported from ComfyUI JSON is added to the library as a new workflow.',
          },
          {
            title: 'Edit the node graph',
            description:
              'Use the add-node buttons above the graph to add nodes. Select a node, choose Start connection from selected node, then click the target node to wire them. Drag nodes to move them, or focus a node and use the arrow keys (Shift for bigger steps). Delete selection removes the selected node or edge. The panel under the graph shows the selected node, and LoRA Loader nodes get a LoRA picker there.',
          },
          {
            title: 'Validate the resolved request',
            description:
              'Click Validate to compute the request the workflow would actually send: model, size, steps, CFG, and prompt, plus any execution issues. This is your dry run before spending compute.',
          },
          {
            title: 'Run the workflow',
            description:
              'Run Workflow stays disabled while blocking issues remain. The run is recorded under Run Output, and its result is added to Assets like any other generation. A failure message appears in the workflow panel.',
          },
          {
            title: 'Export, import, or run on ComfyUI',
            description:
              'Export ComfyUI JSON shows the graph in ComfyUI API format. Paste an API-format prompt into the Import box and choose Import graph to bring one in; the import report lists unsupported nodes and unresolved models. Run on ComfyUI is enabled only for graphs that pass the safety check.',
          },
        ]}
      />

      <GuideCallout title="Real Execution, Not Just Export" tone="accent">
        <p>
          Workflows run real still-image jobs through the existing generation pipeline. A
          successful workflow run adds its output to Assets, so workflows are first-class
          generation entry points alongside Generate and Quick Generate.
        </p>
      </GuideCallout>

      <GuideCallout title="Validation: What It Catches" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Invalid or unsupported graphs</strong>: a graph that cannot be read, or a
              node type workflow execution does not support yet.
            </span>,
            <span>
              <strong>Sampler wiring</strong>: the graph needs exactly one KSampler, its positive
              input connected to a prompt encoder, and its model input connected to a checkpoint
              loader.
            </span>,
            <span>
              <strong>Route problems</strong>: an offline backend on the Local route, or a hosted
              route that is missing its key or model.
            </span>,
            <span>
              <strong>Resolved preview</strong>: the model, size, steps, CFG, and prompt that will
              be sent. Use it to confirm the prompt is what you expect before generating.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Hosted Workflow Route" tone="info">
        <GuideList
          items={[
            <span>
              If the active account uses a hosted still-image route with a model set, workflow
              still-image runs can continue even while the local backend is offline.
            </span>,
            <span>
              The resolved preview shows the routed model, which is the model that will actually
              run on a hosted route.
            </span>,
            <span>
              Hosted runs are prompt-only. LoRA Loader chains are refused on OpenRouter; on
              HuggingFace only a single FLUX Hub-hosted LoRA at strength 1.0 can run.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Workflows vs Pipelines" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Workflows</strong> are node graphs that produce a primary output per run:
              the right tool for &quot;this prompt, this model, these settings, generate.&quot;
            </span>,
            <span>
              <strong>Pipelines</strong> (the Pipelines mode of the Workflows tab) are reusable
              refinement chains that run on existing images. Step types include Upscale, Denoise,
              Sharpen, Face Restore, Color Correct, Background Remove, Style Transfer, Blur, Crop /
              Resize, and Custom.
            </span>,
            <span>
              The two compose: a workflow can produce an asset that a pipeline then refines.
            </span>,
            <span>
              Duplicate a built-in pipeline when a project needs a custom order or stronger
              parameters; the built-ins stay unchanged for quick reuse.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
