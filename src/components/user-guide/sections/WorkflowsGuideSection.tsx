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
            execution, then export the graph as ComfyUI JSON when you need an external graph
            handoff.
          </span>,
          <span>
            <strong>Validate</strong> previews the resolved request for the active workflow,
            including prompt, model, dimensions, and execution issues before you run it.
          </span>,
          <span>
            The run rail records recent workflow output so you can see which execution actually
            completed, failed, or remains in progress.
          </span>,
        ]}
      />

      <GuideStepList
        steps={[
          {
            title: 'Pick or duplicate a starting workflow',
            description:
              'The Workflows panel lists saved workflows on the left. Open one to load its node graph, or duplicate a built-in template when you want a customizable starting point without overwriting the original.',
          },
          {
            title: 'Edit the node graph',
            description:
              'Click a node to inspect its inputs in the right rail. Drag connections between node ports to wire data through the graph. The editor enforces type compatibility -- incompatible wires are rejected at draw time, not at run time.',
          },
          {
            title: 'Validate the resolved request',
            description:
              'Click Validate to compute the request the workflow would actually send: final prompt, selected model, dimensions, references, and any execution issues. This is your dry-run before spending compute.',
          },
          {
            title: 'Run the workflow',
            description:
              'When validation passes, run the workflow. The execution streams progress into the run rail and the result lands in Viewer and Assets -- the same destinations as Generate. Failed runs surface their error in the run rail with the offending node highlighted.',
          },
          {
            title: 'Export the graph if needed',
            description:
              'Use Export to ComfyUI JSON to hand the graph off to an external ComfyUI installation. The export captures node parameters and wiring; runtime values like the active account&apos;s API key are not embedded.',
          },
        ]}
      />

      <GuideCallout title="Real Execution, Not Just Export" tone="accent">
        <p>
          Workflow Workbench runs real still-image jobs through the existing generation pipeline.
          A successful workflow run pushes output into Viewer and Assets -- workflows are not stuck
          at graph editing or JSON export. Treat them as first-class generation entry points
          alongside Generate and Quick Generate.
        </p>
      </GuideCallout>

      <GuideCallout title="Validation: What It Catches" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Missing inputs</strong> -- required ports without a wire or default value.
            </span>,
            <span>
              <strong>Type mismatches</strong> -- wires the editor allowed by accident or graphs
              loaded from external sources with stale connections.
            </span>,
            <span>
              <strong>Provider conflicts</strong> -- graph requires a feature (ControlNet, LoRA,
              video) that the active account&apos;s provider routing does not support.
            </span>,
            <span>
              <strong>Resolved preview</strong> -- the actual prompt text, model id, and
              dimensions that will be sent. Use this to confirm the prompt expansion is what you
              expect before generating.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="OpenRouter Workflow Route" tone="info">
        <GuideList
          items={[
            <span>
              If the active account uses OpenRouter for still images and has a hosted image model
              set, workflow still-image runs can continue even while the local backend is offline.
            </span>,
            <span>
              The routed model shown in the execution summary is the model that will actually run.
              If the graph specifies a model that doesn&apos;t match the active account&apos;s
              provider, validation will surface the conflict before submission.
            </span>,
            <span>
              ControlNet and other guided-graph nodes still require the Local route -- they fail
              validation under OpenRouter. LoRA Loader chains follow the same rule with one
              exception: a single FLUX Hub-hosted LoRA at strength 1.0 validates on the
              HuggingFace route.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Workflows vs Pipelines" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Workflows</strong> are node graphs that produce a single primary output per
              run -- the right tool for "this prompt, this model, these references, generate."
            </span>,
            <span>
              <strong>Pipelines</strong> are reusable local refinement chains -- upscale, restore,
              polish, color-grade, format-convert -- that operate on existing assets. They&apos;re
              the right tool for "I have an image; now run these post-steps in order."
            </span>,
            <span>
              The two compose: a workflow can produce an asset that a pipeline then refines, and
              the result lands as a new asset with a clear lineage to the source.
            </span>,
            <span>
              Duplicate a built-in pipeline starting point when a project needs a custom order or
              stronger parameters -- built-ins remain pristine for quick reuse.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
