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
              'Use Send to Edit: from the Viewer, from a Batch result, from the image preview, or from the right-click menu on the Story tab canvas. For a video, use Extract to Edit in the Viewer or Extract frame to edit on the asset tile. To edit a library image, open it in the Viewer first. The image becomes the base layer.',
          },
          {
            title: 'Pick a tool from the tool strip',
            description:
              'Tools are grouped into Selection & Transform, Drawing, Shapes & Text, and Navigation (see the tour below). Hover a tool to see its keyboard shortcut, or press the letter while the Canvas tab is open.',
          },
          {
            title: 'Set the tool in Tool options',
            description:
              'Brush, Eraser, Clone Stamp, Heal, Shape, and Pen show their settings under the tool strip: size, colour, hardness, opacity, shape kind, outline and fill. [ and ] step the brush size for the painting and retouch tools.',
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
              <strong>Drawing</strong>: Brush (B), Eraser (E), Clone Stamp (S), and Heal (J), for
              painting, erasing, and retouching the image.
            </span>,
            <span>
              <strong>Shapes &amp; Text</strong>: Text (X), Shape (U), and Pen (P), for text,
              rectangles, ellipses, lines, arrows, and freeform paths on top of the image.
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

      <GuideCallout title="Retouching: Clone Stamp and Heal" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Clone Stamp (S)</strong> copies one part of the image over another.
              Alt+click to set the source, then paint. The source follows the brush, so later
              strokes keep the same distance from it until you Alt+click a new one.
            </span>,
            <span>
              <strong>Heal (J)</strong> removes blemishes, dust, and small objects. Paint over the
              spot and Heal finds matching texture nearby, then blends it into the colour and light
              around the stroke. Alt+click first to heal from a source you choose instead.
            </span>,
            <span>
              Size, Hardness, and Opacity are in Tool options, which also show the current source.
              Clear source drops a source you set (Heal goes back to finding texture
              automatically). Retouching changes the image's own pixels, under the adjustments,
              filters, text, and shapes; every stroke is one undo step, and Before/After shows the
              image without it. Clear retouching removes all of it at once.
            </span>,
            <span>
              Retouching needs readable pixels. An image the app cannot read back shows a notice
              instead of painting.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Shapes and Paths" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Shape (U)</strong>: pick Rectangle, Ellipse, Line, or Arrow in Tool options,
              then drag on the image. Hold Shift for a square, a circle, or a 45-degree line.
            </span>,
            <span>
              <strong>Pen (P)</strong>: click to place points. Click the first point to close the
              shape; double-click or press Enter to finish an open path. Backspace removes the last
              point and Esc cancels. Once points are placed, Tool options also offer Finish path,
              Close shape, and Cancel buttons. Turn on Smooth curves for flowing lines instead of
              corners.
            </span>,
            <span>
              Every shape and path is its own layer with an outline colour and width and an
              optional fill. Select one and the Tool options restyle it; switch to Move, Scale, or
              Rotate to transform it.
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

      <GuideCallout title="Region Lock: Generate Region" tone="accent">
        <GuideStepList
          steps={[
            {
              title: 'Create a region',
              description:
                'Open the Region tab in the Properties panel and choose Create Region Lock. Draw its mask on the canvas with the mask tools: Rectangle (R), Lasso (L), Brush (B), and Eraser (E).',
            },
            {
              title: 'Pick the AI tool and prompt',
              description:
                'Give the region a name and choose its AI Tool. Generative Fill fills the mask from the region prompt, so it needs one; Remove clears the masked content and fills it from the surroundings. Turn on Invert Mask to apply the pass to everything outside the drawn mask instead.',
            },
            {
              title: 'Generate Region',
              description:
                'Choose Generate Region. The pass runs on the local backend over the current image, which must be a still loaded from Assets; the result is added to Assets and becomes the canvas image. Style Transfer and Upscale have no region-scoped pass, so use them from the AI Tools tab on the whole image.',
            },
          ]}
        />
      </GuideCallout>

      <GuideCallout title="History, Before/After, and Export to Assets" tone="info">
        <GuideList
          items={[
            <span>
              <strong>History</strong> in the Properties panel toolbar lists every edit with the
              time it was made. Click an entry to jump straight back to that step; later steps stay
              listed until you make a new edit.
            </span>,
            <span>
              <strong>Before/After</strong> shows the original image without your edits, so you can
              judge a change without undoing it.
            </span>,
            <span>
              <strong>Export to Assets</strong> (the download button in the same toolbar) flattens
              the image with its adjustments, filters, retouching, text, and shapes into a PNG,
              saves it to <code>&lt;output root&gt;/edits/</code>, and adds it to Assets. Turn
              Before/After off first; export is disabled while it is on.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="The Story Tab Canvas" tone="info">
        <GuideList
          items={[
            <span>
              The Story tab centre shows the current image on a preview canvas. The mouse wheel
              zooms, + or = zooms in, - zooms out, and 0 resets zoom and pan. Shift+drag or a
              middle-button drag pans.
            </span>,
            <span>
              Right-click it (or focus it and press Shift+F10 or the Menu key) for the canvas
              menu: Copy Image,
              Save As, Send to Edit, Refine with one of your pipelines, Generation Info, Open in
              Explorer, Zoom to Fit, and Zoom to 100%.
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
