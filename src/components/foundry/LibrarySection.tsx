import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/appStore';
import type { DownloadJob } from '@/types/model';
import { DownloadRow } from './DownloadRow';
import { InstalledModelCard } from './InstalledModelCard';
import { LibraryRootsManager } from './LibraryRootsManager';

/** Downloads worth surfacing: everything except a finished or cancelled job. */
const VISIBLE_DOWNLOAD_STATUSES = new Set<DownloadJob['status']>([
  'queued',
  'downloading',
  'verifying',
  'paused',
  'error',
]);

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mono-label text-text-muted">{children}</h2>;
}

/**
 * Library - the local model surface. Composes the live download queue, the
 * installed model grid, and the library-roots manager into one scrollable view.
 * Active downloads are mapped to their catalog name; a model still downloading
 * is shown under Downloads, not yet under Installed.
 */
export function LibrarySection() {
  const { availableModels, downloads } = useAppStore(
    useShallow((s) => ({
      availableModels: s.availableModels,
      downloads: s.downloads,
    })),
  );

  const activeJobs = Object.values(downloads).filter((job) =>
    VISIBLE_DOWNLOAD_STATUSES.has(job.status),
  );
  const downloadingIds = new Set(activeJobs.map((job) => job.model_id));
  const installed = availableModels.filter((model) => !downloadingIds.has(model.id));

  const nameFor = (modelId: string) =>
    availableModels.find((model) => model.id === modelId)?.name ?? modelId;

  return (
    <div className="space-y-8">
      <section data-testid="foundry-downloads" className="space-y-3">
        <SectionHeading>Downloads</SectionHeading>
        {activeJobs.length === 0 ? (
          <p className="text-sm text-text-muted">No active downloads.</p>
        ) : (
          <div className="space-y-2">
            {activeJobs.map((job) => (
              <DownloadRow key={job.model_id} job={job} modelName={nameFor(job.model_id)} />
            ))}
          </div>
        )}
      </section>

      <section data-testid="foundry-installed" className="space-y-3">
        <SectionHeading>Installed models</SectionHeading>
        {installed.length === 0 ? (
          <p className="text-sm text-text-muted">
            No models installed yet. Discover and acquire one, or add a library root below.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {installed.map((model) => (
              <InstalledModelCard key={model.id} model={model} />
            ))}
          </div>
        )}
      </section>

      <section data-testid="foundry-roots" className="space-y-3">
        <SectionHeading>Library roots</SectionHeading>
        <LibraryRootsManager />
      </section>
    </div>
  );
}
