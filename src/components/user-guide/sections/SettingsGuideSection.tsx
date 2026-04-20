import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function SettingsGuideSection() {
  return (
    <UserGuideSection
      id="guide-settings"
      title="Settings"
      summary="Configure output paths, backend startup, models, tagging, appearance, and notifications."
    >
      <GuideList
        items={[
          'Changing the default output path restarts the backend so new jobs write to the selected location.',
          'Use AI & Models to start the backend, inspect GPU state, and manage installed models.',
          'Notification settings control desktop alerts for completed jobs, failed jobs, and model downloads.',
        ]}
      />
    </UserGuideSection>
  );
}
