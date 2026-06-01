import { GettingStartedGuideSection } from '@/components/user-guide/sections/GettingStartedGuideSection';
import { GenerateGuideSection } from '@/components/user-guide/sections/GenerateGuideSection';
import { CanvasGuideSection } from '@/components/user-guide/sections/CanvasGuideSection';
import { StoryGuideSection } from '@/components/user-guide/sections/StoryGuideSection';
import { TimelineGuideSection } from '@/components/user-guide/sections/TimelineGuideSection';
import { WorkflowsGuideSection } from '@/components/user-guide/sections/WorkflowsGuideSection';
import { AssetsGuideSection } from '@/components/user-guide/sections/AssetsGuideSection';
import { SettingsGuideSection } from '@/components/user-guide/sections/SettingsGuideSection';

const GUIDE_LINKS = [
  { href: '#guide-start-here', label: 'Start Here' },
  { href: '#guide-generate', label: 'Generate' },
  { href: '#guide-canvas', label: 'Canvas' },
  { href: '#guide-story', label: 'Story' },
  { href: '#guide-timeline', label: 'Timeline' },
  { href: '#guide-workflows', label: 'Workflows' },
  { href: '#guide-assets', label: 'Assets' },
  { href: '#guide-settings', label: 'Settings' },
] as const;

export function UserGuidePage() {
  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="max-w-3xl">
        <p className="text-label text-text-muted">Help</p>
        <h1 className="mt-1 text-2xl font-semibold text-text-primary">
          User Guide
        </h1>
        <p className="mt-2 text-sm text-text-body">
          Vision Studio is now local-first with optional OpenRouter BYOK. Use one active account at
          a time, route prompt tools and still-image generation where you need them, and move work
          through Story, Timeline, Workflows, Canvas, Viewer, and Assets without breaking context.
        </p>

        <div className="mt-6 rounded-xl border border-border bg-elevated p-4">
          <p className="type-ui text-text-primary">Jump To</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {GUIDE_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-body transition-all hover:border-border-hover hover:text-text-primary"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <GettingStartedGuideSection />
        <GenerateGuideSection />
        <CanvasGuideSection />
        <StoryGuideSection />
        <TimelineGuideSection />
        <WorkflowsGuideSection />
        <AssetsGuideSection />
        <SettingsGuideSection />
      </div>
    </div>
  );
}
