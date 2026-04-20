import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function CanvasGuideSection() {
  return (
    <UserGuideSection
      id="guide-canvas"
      title="Canvas"
      summary="Edit the active image with layers, masks, adjustments, and refinement actions."
    >
      <GuideList
        items={[
          'Select a tool from the left strip, then adjust tool-specific settings below it.',
          'Use Layers to manage visibility and ordering while keeping the active image intact.',
          'Right-click an image region to run a refinement pipeline from the current canvas context.',
        ]}
      />
    </UserGuideSection>
  );
}
