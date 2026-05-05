import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { GuideStepList } from '../GuideStepList';
import { UserGuideSection } from '../UserGuideSection';

export function CanvasGuideSection() {
  return (
    <UserGuideSection
      id="guide-canvas"
      title="Canvas"
      summary="Use Canvas as the finishing surface for layered image edits, masks, AI tool passes, and reference-aware refinement."
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

      <GuideStepList
        steps={[
          {
            title: 'Bring an image onto the canvas',
            description:
              'Either generate one from Generate, drop an image into the canvas, or right-click an asset in the library and choose Open in Canvas. The image becomes the base layer.',
          },
          {
            title: 'Pick a tool from the left strip',
            description:
              'Tools are grouped into Selection & Transform, Drawing, Shapes & Text, and Navigation (see the tools tour below). Hover any tool to see its keyboard shortcut.',
          },
          {
            title: 'Adjust the active layer',
            description:
              'Use the Properties panel on the right to change opacity, blend mode, position, and tool-specific parameters. Most numeric inputs accept drag-to-scrub for fine control.',
          },
          {
            title: 'Run an AI Tool when you need a pass',
            description:
              'Open the AI Tools panel for non-destructive edits -- background removal, AI upscale, style transfer, generative fill, face enhancement, object removal, and AI expand. Each tool runs on the active layer or the masked region.',
          },
          {
            title: 'Use undo/redo freely while you iterate',
            description:
              'Ctrl/Cmd+Z and Ctrl/Cmd+Y (or Ctrl/Cmd+Shift+Z) are wired globally -- you can undo across panels without losing canvas state. Layers are preserved in the history stack.',
          },
        ]}
      />

      <GuideCallout title="Tool Strip Tour" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Selection &amp; Transform</strong>: Move (V), Scale (T), Crop (C), Rotate (R)
              -- for repositioning, resizing, cropping, and rotating the active layer.
            </span>,
            <span>
              <strong>Drawing</strong>: Brush (B), Eraser (E), Clone Stamp (S), Heal (J) -- for
              painting, erasing, copying pixels, and frequency-aware healing.
            </span>,
            <span>
              <strong>Shapes &amp; Text</strong>: Text (X), Shape (U), Pen (P) -- for adding
              vector text, primitive shapes, and bezier paths on top of any layer.
            </span>,
            <span>
              <strong>Navigation</strong>: Hand (H), Zoom (Z), Eyedropper (I) -- for panning,
              zooming, and sampling colors. Spacebar temporarily activates Hand from any tool.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Layers" tone="info">
        <GuideList
          items={[
            <span>
              Each generation, paint stroke, shape, and text element lives on its own layer with
              independent visibility, opacity, and blend mode.
            </span>,
            <span>
              Drag layers to reorder them in the panel -- top layers paint over lower ones. Toggle
              the eye icon to hide without deleting; toggle the lock to prevent accidental edits.
            </span>,
            <span>
              Right-click a layer for Duplicate, Merge Down, Flatten, and Delete. Group selection
              respects multi-layer transforms so you can move a composition together.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="AI Tools Panel" tone="accent">
        <GuideList
          items={[
            <span>
              <strong>Background Removal</strong> with adjustable Edge Refinement and an optional
              Replace Background prompt that re-fills the cut-out area.
            </span>,
            <span>
              <strong>AI Upscale</strong> at 2x or 4x with model variants tuned for General, Face,
              or Anime sources.
            </span>,
            <span>
              <strong>Style Transfer</strong> with built-in presets (Van Gogh, Monet, Ukiyo-e,
              Comic, Watercolor, Pencil Sketch) and a strength slider.
            </span>,
            <span>
              <strong>Generative Fill</strong>, <strong>Face Enhancement</strong>,{' '}
              <strong>Object Removal</strong>, and <strong>AI Expand</strong> (outpaint) for
              fill-in, restoration, removal, and outward extension respectively.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Reference-Aware Finishing" tone="info">
        <p>
          Current-run, scene, and project references can keep composition, style, character, and
          pose language aligned while you refine an image. Those same references can also feed
          Generate and Story surfaces when you move upstream again -- the reference set follows
          your work, not the panel you happen to be in.
        </p>
      </GuideCallout>

      <GuideCallout title="Local-Only Image Controls" tone="warning">
        <p>
          Canvas-oriented image controls such as inpaint, ControlNet, generative fill, face
          enhancement, and other guided passes stay on the local backend route. Use the Local
          still-image provider when your pass depends on canvas structure or reference-driven
          image edits -- switching the active account&apos;s image provider to OpenRouter disables
          these controls for that account.
        </p>
      </GuideCallout>
    </UserGuideSection>
  );
}
