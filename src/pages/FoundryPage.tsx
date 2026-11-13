import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import type { DownloadStatus } from '@/types/model';
import { FoundryHeaderBar } from '@/components/foundry/FoundryHeaderBar';
import { ProvisioningCard } from '@/components/foundry/ProvisioningCard';
import { DiscoverSection } from '@/components/foundry/DiscoverSection';
import { LibrarySection } from '@/components/foundry/LibrarySection';
import { HardwareSection } from '@/components/foundry/HardwareSection';

type FoundrySection = 'discover' | 'library' | 'hardware';

const SECTIONS: { id: FoundrySection; label: string }[] = [
  { id: 'discover', label: 'Discover' },
  { id: 'library', label: 'Library' },
  { id: 'hardware', label: 'Hardware' },
];

const DOWNLOAD_POLL_INTERVAL_MS = 2500;

/**
 * A download is "in flight" while it is queued, transferring, or being verified;
 * paused and terminal jobs (ready/error/cancelled) need no polling because the
 * next status change is user-driven and re-triggers the queue effect via state.
 * Mirrors the SettingsPanel poller so both surfaces agree on liveness.
 */
const ACTIVE_DOWNLOAD_STATUSES = new Set<DownloadStatus>([
  'queued',
  'downloading',
  'verifying',
]);

/**
 * Model Foundry - top-level surface for discovering, acquiring, and managing
 * local AI models. This shell owns the section switcher, warms the catalog /
 * download queue / library roots / hardware profile on mount, and polls the
 * download queue while any job is in flight. Below the header bar and the
 * first-run provisioning card it renders one of the Discover / Library /
 * Hardware sections at a time.
 */
export function FoundryPage() {
  const [section, setSection] = useState<FoundrySection>('discover');
  const tabRefs = useRef<Partial<Record<FoundrySection, HTMLButtonElement | null>>>({});

  // WAI-ARIA tabs: arrows / Home / End move between sections (roving tabindex).
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = SECTIONS.findIndex((s) => s.id === section);
    const last = SECTIONS.length - 1;
    const nextIndex =
      event.key === 'ArrowRight'
        ? (index + 1) % SECTIONS.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + SECTIONS.length) % SECTIONS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (nextIndex === -1) return;
    event.preventDefault();
    const next = SECTIONS[nextIndex].id;
    setSection(next);
    tabRefs.current[next]?.focus();
  };

  const { loadModels, refreshDownloads, loadLibraryRoots, loadHardwareProfile, downloads } =
    useAppStore(
      useShallow((s) => ({
        loadModels: s.loadModels,
        refreshDownloads: s.refreshDownloads,
        loadLibraryRoots: s.loadLibraryRoots,
        loadHardwareProfile: s.loadHardwareProfile,
        downloads: s.downloads,
      })),
    );

  // Warm every Foundry data source once when the surface opens. Each action is
  // local-first (swallows backend hiccups), so a cold backend simply yields
  // empty sections rather than throwing.
  useEffect(() => {
    void loadModels();
    void refreshDownloads();
    void loadLibraryRoots();
    void loadHardwareProfile();
  }, [loadModels, refreshDownloads, loadLibraryRoots, loadHardwareProfile]);

  // Poll the download queue while any job is in flight. The effect re-arms each
  // time `downloads` changes, so it naturally stops once every job reaches a
  // terminal/paused state.
  useEffect(() => {
    const hasActiveDownload = Object.values(downloads).some((job) =>
      ACTIVE_DOWNLOAD_STATUSES.has(job.status),
    );
    if (!hasActiveDownload) return;
    const timer = setTimeout(() => {
      void refreshDownloads();
    }, DOWNLOAD_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [downloads, refreshDownloads]);

  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="mx-auto max-w-6xl">
        <p className="mono-label text-text-muted">Models</p>
        <h1 className="mt-1 type-title">Foundry</h1>
        <p className="mt-2 max-w-[70ch] text-sm text-text-body">
          Discover and acquire models, manage your local library, and check how each
          model fits your hardware.
        </p>

        <div className="mt-6">
          <FoundryHeaderBar />
        </div>

        <ProvisioningCard />

        <div role="tablist" aria-label="Foundry sections" className="mt-6 flex gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              ref={(node) => {
                tabRefs.current[s.id] = node;
              }}
              id={`foundry-tab-${s.id}`}
              role="tab"
              type="button"
              aria-selected={section === s.id}
              aria-controls="foundry-tabpanel"
              tabIndex={section === s.id ? 0 : -1}
              onClick={() => setSection(s.id)}
              onKeyDown={handleTabKeyDown}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition',
                section === s.id
                  ? 'border-border-hover bg-elevated text-text-primary'
                  : 'border-border text-text-body hover:border-border-hover hover:text-text-primary',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div
          id="foundry-tabpanel"
          role="tabpanel"
          aria-labelledby={`foundry-tab-${section}`}
          data-testid={`foundry-section-${section}`}
          className="mt-6"
        >
          {section === 'discover' && <DiscoverSection />}
          {section === 'library' && <LibrarySection />}
          {section === 'hardware' && <HardwareSection />}
        </div>
      </div>
    </div>
  );
}
