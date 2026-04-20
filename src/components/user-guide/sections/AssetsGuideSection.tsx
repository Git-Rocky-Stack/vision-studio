import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function AssetsGuideSection() {
  return (
    <UserGuideSection
      id="guide-assets"
      title="Assets"
      summary="Browse, favorite, export, reveal, and organize generated media."
    >
      <GuideList
        items={[
          'Assets tracks generated files from the internal output folder and custom output roots.',
          'Collections group assets manually or through smart rules and tagging metadata.',
          'Export actions are constrained to user-safe folders such as Downloads, Pictures, and Documents.',
        ]}
      />
    </UserGuideSection>
  );
}
