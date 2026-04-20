import { GenerateGuideSection } from '@/components/user-guide/sections/GenerateGuideSection';
import { CanvasGuideSection } from '@/components/user-guide/sections/CanvasGuideSection';
import { StoryGuideSection } from '@/components/user-guide/sections/StoryGuideSection';
import { WorkflowsGuideSection } from '@/components/user-guide/sections/WorkflowsGuideSection';
import { AssetsGuideSection } from '@/components/user-guide/sections/AssetsGuideSection';
import { SettingsGuideSection } from '@/components/user-guide/sections/SettingsGuideSection';

export function UserGuidePage() {
  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="max-w-3xl">
        <p className="text-label text-text-muted">Help</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">
          User Guide
        </h1>
        <p className="mt-2 text-sm text-text-body">
          Use each workspace for the part of production it owns, then move results through the center viewer, canvas, assets, and collections as needed.
        </p>
      </div>

      <div className="mt-8">
        <GenerateGuideSection />
        <CanvasGuideSection />
        <StoryGuideSection />
        <WorkflowsGuideSection />
        <AssetsGuideSection />
        <SettingsGuideSection />
      </div>
    </div>
  );
}
