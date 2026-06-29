import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import type { DownloadStatus } from '@/types/model';
import { FoundryHeaderBar } from '@/components/foundry/FoundryHeaderBar';
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
 * download queue while any job is in flight. The Discover / Library / Hardware
 * sections and the header bar mount into the placeholders in later tasks.
 */
export function FoundryPage() {
  const [section, setSection] = useState<FoundrySection>('discover');

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
        <h1 className="mt-1 text-2xl font-semibold text-text-primary">Foundry</h1>
        <p className="mt-2 text-sm text-text-body">
          Discover and acquire models, manage your local library, and check how each
          model fits your hardware.
        </p>

        <div className="mt-6">
          <FoundryHeaderBar />
        </div>

        <div role="tablist" aria-label="Foundry sections" className="mt-6 flex gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              role="tab"
              type="button"
              aria-selected={section === s.id}
              onClick={() => setSection(s.id)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-all',
                section === s.id
                  ? 'border-border-hover bg-elevated text-text-primary'
                  : 'border-border text-text-body hover:border-border-hover hover:text-text-primary',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div data-testid={`foundry-section-${section}`} className="mt-6">
          {section === 'discover' && <DiscoverSection />}
          {section === 'library' && <LibrarySection />}
          {section === 'hardware' && <HardwareSection />}
        </div>
      </div>
    </div>
  );
}
