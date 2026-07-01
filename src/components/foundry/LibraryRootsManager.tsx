import { useState } from 'react';
import { FolderPlus, FolderSearch, RefreshCw, Trash2, Plus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';
import type { LayoutHint } from '@/types/model';

const HINTS: { id: LayoutHint; label: string }[] = [
  { id: 'generic', label: 'Generic' },
  { id: 'comfyui', label: 'ComfyUI' },
  { id: 'a1111', label: 'Automatic1111' },
];

/**
 * Manage library roots - folders of existing models indexed in place (bytes are
 * referenced, never copied). Add a folder via the OS picker with a layout hint,
 * rescan indexed roots, or run first-run detection and opt in to any offered
 * ComfyUI/A1111 install. Each root can be removed (the source files stay).
 */
export function LibraryRootsManager() {
  const {
    libraryRoots,
    detectedRoots,
    addLibraryRoot,
    removeLibraryRoot,
    scanLibraries,
    detectLibraries,
  } = useAppStore(
    useShallow((s) => ({
      libraryRoots: s.libraryRoots,
      detectedRoots: s.detectedRoots,
      addLibraryRoot: s.addLibraryRoot,
      removeLibraryRoot: s.removeLibraryRoot,
      scanLibraries: s.scanLibraries,
      detectLibraries: s.detectLibraries,
    })),
  );

  const [hint, setHint] = useState<LayoutHint>('generic');
  const [scanning, setScanning] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const addFolder = async () => {
    const path = await window.electron?.dialog?.selectFolder();
    if (!path) return;
    void addLibraryRoot(path, hint);
  };

  const runScan = async () => {
    setScanning(true);
    try {
      await scanLibraries();
    } finally {
      setScanning(false);
    }
  };

  const runDetect = async () => {
    setDetecting(true);
    try {
      await detectLibraries();
    } finally {
      setDetecting(false);
    }
  };

  // Hide offers that already correspond to an indexed root.
  const offers = detectedRoots.filter(
    (offer) => !libraryRoots.some((root) => root.path === offer.path),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="mono-label text-text-muted">New root layout</span>
          <select
            aria-label="New root layout"
            value={hint}
            onChange={(event) => setHint(event.target.value as LayoutHint)}
            className="rounded-md border border-border bg-elevated px-2 py-1.5 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
          >
            {HINTS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" size="sm" icon={FolderPlus} onClick={addFolder}>
          Add folder
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          isLoading={scanning}
          onClick={runScan}
        >
          Scan now
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={FolderSearch}
          isLoading={detecting}
          onClick={runDetect}
        >
          Detect installs
        </Button>
      </div>

      {libraryRoots.length === 0 ? (
        <p className="text-sm text-text-muted">
          No library roots yet. Add a folder of existing models to index them in place.
        </p>
      ) : (
        <ul className="space-y-2">
          {libraryRoots.map((root) => (
            <li
              key={root.id}
              className="recessed-well flex items-center justify-between gap-2 rounded-md p-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary" title={root.path}>
                  {root.path}
                </p>
                <span className="mono-label text-text-muted">{root.layout_hint}</span>
              </div>
              <button
                type="button"
                aria-label="Remove root"
                onClick={() => removeLibraryRoot(root.id)}
                className="flex-shrink-0 rounded-md p-1.5 text-text-body hover:bg-status-error/10 hover:text-status-error"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {offers.length > 0 && (
        <div className="space-y-2">
          <p className="mono-label text-text-muted">Detected installs</p>
          <ul className="space-y-2">
            {offers.map((offer) => (
              <li
                key={offer.path}
                className="recessed-well flex items-center justify-between gap-2 rounded-md p-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary" title={offer.path}>
                    {offer.path}
                  </p>
                  <span className="mono-label text-text-muted">{offer.layout_hint}</span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Plus}
                  aria-label={`Add ${offer.path}`}
                  onClick={() => addLibraryRoot(offer.path, offer.layout_hint)}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
