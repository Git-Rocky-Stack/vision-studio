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
    // A Settings tab: the Settings panel supplies the h1, the scroller and the
    // padding, exactly as it does for every other tab.
    <div>
      <div className="max-w-3xl">
        <p className="mono-label text-text-muted">Help</p>
        <h2 className="mt-1 type-title">
          User Guide
        </h2>
        <p className="mt-2 text-sm text-text-body">
          Vision Studio is local-first: generation runs on your own GPU by default. Bring your own
          OpenRouter key or Hugging Face token (BYOK) only when you want a hosted route. Use one
          active account at a time, choose per account where prompt tools, still images, and video
          run, and move work through Story, Timeline, Workflows, Canvas, Viewer, and Assets without
          breaking context.
        </p>

        <div className="mt-6 rounded-sm border border-border bg-elevated p-4">
          <p className="type-ui text-text-primary">Jump To</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {GUIDE_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-body transition hover:border-border-hover hover:text-text-primary"
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
