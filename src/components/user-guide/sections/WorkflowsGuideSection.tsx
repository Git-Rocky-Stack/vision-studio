import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function WorkflowsGuideSection() {
  return (
    <UserGuideSection
      id="guide-workflows"
      title="Workflows"
      summary="Build node graphs, validate real execution requests, and keep repeatable still-image runs under versioned control."
    >
      <GuideList
        items={[
          <span>
            Use <strong>Workflows</strong> for node graph authoring, validation, and still-image
            execution, then export the graph as ComfyUI JSON when you need an external graph handoff.
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

      <GuideCallout title="Real Execution, Not Just Export" tone="accent">
        <p>
          Workflow Workbench now runs real still-image jobs through the existing generation pipeline.
          That means a successful workflow run can push output into Viewer and Assets instead of
          stopping at graph editing or JSON export.
        </p>
      </GuideCallout>

      <GuideCallout title="OpenRouter Workflow Route">
        <p>
          If the active account uses OpenRouter for still images and has a hosted image model set,
          workflow still-image runs can continue even while the local backend is offline. The routed
          model shown in the execution summary is the model that will actually run.
        </p>
      </GuideCallout>

      <GuideCallout title="Pipelines">
        <p>
          Pipelines remain the place for reusable local refinement chains such as upscale, restore,
          and polish. Duplicate a built-in starting point when a project needs a custom order or
          stronger parameters.
        </p>
      </GuideCallout>
    </UserGuideSection>
  );
}
