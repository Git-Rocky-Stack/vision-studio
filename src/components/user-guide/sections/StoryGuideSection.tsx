import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function StoryGuideSection() {
  return (
    <UserGuideSection
      id="guide-story"
      title="Story"
      summary="Plan storyboards, templates, character references, and scene progression."
    >
      <GuideList
        items={[
          'Storyboard mode manages scene cards, prompts, timing, and scene status.',
          'Templates provide reusable starting points for common social, portrait, product, and cinematic formats.',
          'Use the timeline controls to review scene order and playback pacing before generating final assets.',
        ]}
      />
    </UserGuideSection>
  );
}
