import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function CanvasGuideSection() {
  return (
    <UserGuideSection
      id="guide-canvas"
      title="Canvas"
      summary="Use Canvas as the finishing surface for layered image edits, masks, and guided refinement."
    >
      <GuideList
        items={[
          <span>
            Select a tool from the left strip, then adjust the layer, mask, or image-specific
            controls in the surrounding work surface.
          </span>,
          <span>
            Use Layers to preserve ordering and visibility while refining the active image instead
            of flattening every change into a single destructive pass.
          </span>,
          <span>
            Canvas remains the best place to continue working after a Generate, Workflow, or
            Timeline still result becomes the active image.
          </span>,
        ]}
      />

      <GuideCallout title="Reference-Aware Finishing">
        <p>
          Current-run, scene, and project references can keep composition, style, character, and
          pose language aligned while you refine an image. Those same references can also feed
          Generate and Story surfaces when you move upstream again.
        </p>
      </GuideCallout>

      <GuideCallout title="Local-Only Image Controls" tone="warning">
        <p>
          Canvas-oriented image controls such as inpaint, ControlNet, and other guided passes stay
          on the local backend route. Use the Local still-image provider when your pass depends on
          canvas structure or reference-driven image edits.
        </p>
      </GuideCallout>
    </UserGuideSection>
  );
}
