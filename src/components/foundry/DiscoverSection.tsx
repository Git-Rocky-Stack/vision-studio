import { useState, type FormEvent } from 'react';
import { Search, Loader2, WifiOff, PackageSearch, ChevronLeft, ChevronRight } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/utils/cn';
import type { SearchSource } from '@/types/model';

const SOURCES: { id: SearchSource; label: string }[] = [
  { id: 'hf', label: 'Hugging Face' },
  { id: 'civitai', label: 'CivitAI' },
];

/**
 * Discover - the model hub browser. Owns the source toggle, query box, NSFW
 * opt-in (CivitAI-only, session-only), and pagination, driving the shared
 * `searchModels` store action. The query and source are local state seeded from
 * the store so reopening Discover preserves the last browse; the results,
 * status, and warning come from the store. Renders one entry per `SearchResult`
 * (the rich `SearchResultCard` with the acquire flow lands in Task 5).
 */
export function DiscoverSection() {
  const {
    searchModels,
    setNsfwOptIn,
    searchResults,
    searchStatus,
    searchQuery,
    searchSource,
    searchPage,
    searchWarning,
    nsfwOptIn,
  } = useAppStore(
    useShallow((s) => ({
      searchModels: s.searchModels,
      setNsfwOptIn: s.setNsfwOptIn,
      searchResults: s.searchResults,
      searchStatus: s.searchStatus,
      searchQuery: s.searchQuery,
      searchSource: s.searchSource,
      searchPage: s.searchPage,
      searchWarning: s.searchWarning,
      nsfwOptIn: s.nsfwOptIn,
    })),
  );

  const [source, setSource] = useState<SearchSource>(searchSource);
  const [query, setQuery] = useState(searchQuery);

  const runSearch = (page: number) => {
    const trimmed = query.trim();
    if (!trimmed || page < 1) return;
    void searchModels(trimmed, source, page);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    runSearch(1);
  };

  const isLoading = searchStatus === 'loading';

  return (
    <div className="space-y-4">
      {/* Source toggle */}
      <div role="group" aria-label="Search source" className="flex gap-2">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={source === s.id}
            onClick={() => setSource(s.id)}
            className={cn(
              'mono-label rounded-md border px-3 py-1.5 transition-all',
              source === s.id
                ? 'border-border-hover bg-elevated text-text-primary'
                : 'border-border text-text-body hover:border-border-hover hover:text-text-primary',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Query + submit */}
      <form
        data-testid="foundry-search-form"
        onSubmit={handleSubmit}
        className="flex items-stretch gap-2"
      >
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search models"
            placeholder={`Search ${source === 'hf' ? 'Hugging Face' : 'CivitAI'} models...`}
            className={cn(
              'w-full rounded-md border border-border bg-elevated py-2 pl-10 pr-3 text-sm text-text-primary placeholder:text-text-muted',
              'focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/35 transition-all duration-200',
            )}
          />
        </div>
        <Button type="submit" variant="primary" isLoading={isLoading} icon={Search}>
          Search
        </Button>
      </form>

      {/* NSFW opt-in (CivitAI only, session-only) */}
      {source === 'civitai' && (
        <div className="flex items-center gap-2">
          <Switch
            checked={nsfwOptIn}
            onChange={setNsfwOptIn}
            label="Show mature (NSFW) results"
          />
          <span className="text-sm text-text-body">Show mature (NSFW) results</span>
          <span className="mono-label text-text-muted">Resets each launch</span>
        </div>
      )}

      {/* Result states */}
      {searchStatus === 'offline' && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-status-warning/40 bg-status-warning/5 px-3 py-2 text-sm text-status-warning"
        >
          <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{searchWarning ?? 'Search is offline. Check your connection and try again.'}</span>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 py-8 text-sm text-text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Searching {source === 'hf' ? 'Hugging Face' : 'CivitAI'}...
        </div>
      )}

      {searchStatus === 'idle' && (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-text-muted">
          <PackageSearch aria-hidden="true" className="h-8 w-8" />
          <p className="text-sm">
            Search Hugging Face and CivitAI for image and video models, then acquire them
            straight into your local library.
          </p>
        </div>
      )}

      {searchStatus === 'ready' && searchResults.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-text-muted">
          <PackageSearch aria-hidden="true" className="h-8 w-8" />
          <p className="text-sm">No results. Try a different query or source.</p>
        </div>
      )}

      {searchStatus === 'ready' && searchResults.length > 0 && (
        <>
          <ul
            data-testid="foundry-search-results"
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            {searchResults.map((result) => (
              <li
                key={result.id}
                className="raised-panel rounded-md p-3 text-sm text-text-primary"
              >
                {result.name}
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="secondary"
              size="sm"
              icon={ChevronLeft}
              disabled={searchPage <= 1 || isLoading}
              onClick={() => runSearch(searchPage - 1)}
            >
              Previous
            </Button>
            <span className="mono-label text-text-muted">Page {searchPage}</span>
            <Button
              variant="secondary"
              size="sm"
              icon={ChevronRight}
              iconPosition="right"
              disabled={isLoading}
              onClick={() => runSearch(searchPage + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
