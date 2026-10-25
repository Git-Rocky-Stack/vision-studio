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
            The Canvas tab is the layer editor. The left dock holds the tool strip and the
            Properties panel; the right dock holds Layers.
          </span>,
          <span>
            Use Layers to preserve ordering and visibility while refining the active image instead
            of flattening every change into a single destructive pass.
          </span>,
          <span>
            Canvas is the place to continue working after a Generate, Workflow, Batch, or Timeline
            still becomes the active image.
          </span>,
        ]}
      />

      <GuideStepList
        steps={[
          {
            title: 'Bring an image onto the canvas',
            description:
              'Use Send to Edit: from the Viewer, from a Batch result, from the image preview, or from the right-click menu on the Generate canvas. For a video, use Extract to Edit in the Viewer or Extract frame to edit on the asset tile. To edit a library image, open it in the Viewer first. The image becomes the base layer.',
          },
          {
            title: 'Pick a tool from the tool strip',
            description:
              'Tools are grouped into Selection & Transform, Drawing, Shapes & Text, and Navigation (see the tour below). Hover a tool to see its keyboard shortcut, or press the letter while the Canvas tab is open.',
          },
          {
            title: 'Adjust the image in the Properties panel',
            description:
              'The Properties panel has Adjust, Filters, Crop, Text, AI Tools, Control, and Region tabs. Layer opacity and blend mode are set on each row in the Layers panel.',
          },
          {
            title: 'Run an AI Tool when you need a pass',
            description:
              'Open the AI Tools tab for background removal, AI upscale, style transfer, generative fill, face enhancement, object removal, and AI expand. These run on the local backend.',
          },
          {
            title: 'Use undo and redo while you iterate',
            description:
              'Ctrl/Cmd+Z undoes canvas edits (layers, strokes, adjustments, and filters); Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redoes them. The keys work from anywhere in the app except text fields, and the history keeps up to 100 steps. They do not undo work in other panels.',
          },
        ]}
      />

      <GuideCallout title="Tool Strip Tour" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Selection &amp; Transform</strong>: Move (V), Scale (T), Crop (C), Rotate
              (R), for repositioning, resizing, cropping, and rotating.
            </span>,
            <span>
              <strong>Drawing</strong>: Brush (B), Eraser (E), for painting and erasing strokes.
              Clone Stamp and Heal are shown but not available yet.
            </span>,
            <span>
              <strong>Shapes &amp; Text</strong>: Text (X), for adding text on top of the image.
              Shape and Pen are shown but not available yet.
            </span>,
            <span>
              <strong>Navigation</strong>: Hand (H) to drag the view, Zoom (Z) to click in
              (Shift+click out), and Eyedropper (I) to sample a color into the brush and the
              selected text layer. The mouse wheel zooms with any tool.
            </span>,
            <span>
              While the Control or Region tab is open, the letters switch to the mask tools:
              Select (V), Rectangle (R), Lasso (L), Brush (B), Eraser (E), and Invert mask (I).
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Layers" tone="info">
        <GuideList
          items={[
            <span>
              Each layer has its own visibility, opacity, and blend mode. Double-click a layer
              name to rename it.
            </span>,
            <span>
              Drag a layer by its handle to reorder it (or focus the handle and press Arrow Up or
              Arrow Down); top layers paint over lower ones. Toggle the eye to hide a layer without
              deleting it, and the lock to prevent accidental edits.
            </span>,
            <span>
              Use the New Layer, Duplicate Layer, and Delete Layer buttons in the panel header.
              There is no right-click menu on layers.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="AI Tools" tone="accent">
        <GuideList
          items={[
            <span>
              <strong>Background Removal</strong> with adjustable Edge Refinement and an optional
              Replace Background prompt that re-fills the cut-out area.
            </span>,
            <span>
              <strong>AI Upscale</strong> at 2x or 4x with General, Face, or Anime model variants.
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
          pose language aligned while you refine an image. The same references also feed Generate
          and Story when you move upstream again, so the reference set follows your work, not the
          panel you happen to be in.
        </p>
      </GuideCallout>

      <GuideCallout title="Local-Only Image Controls" tone="warning">
        <p>
          Canvas-oriented image controls such as inpaint, ControlNet, generative fill, face
          enhancement, and other guided passes stay on the local backend route. Use the Local
          still-image provider when your pass depends on canvas structure or reference-driven
          image edits. Hosted still-image routes (OpenRouter and HuggingFace) are prompt-only and
          refuse these inputs.
        </p>
      </GuideCallout>
    </UserGuideSection>
  );
}
