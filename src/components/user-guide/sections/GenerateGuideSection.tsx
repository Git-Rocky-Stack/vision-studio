import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function GenerateGuideSection() {
  return (
    <UserGuideSection
      id="guide-generate"
      title="Generate"
      summary="Create images and videos from prompts, presets, and reference frames."
    >
      <GuideList
        items={[
          'Use Generate for detailed prompt control, Quick for fast drafts, Batch for prompt sets, and Studio for composition work.',
          'Choose the aspect ratio and resolution before starting a job so outputs match the target surface.',
          'Open the center Viewer tab after a job completes to inspect results without leaving the generate workspace.',
        ]}
      />
    </UserGuideSection>
  );
}
