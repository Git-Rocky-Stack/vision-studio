import { useState } from 'react';
import { cn } from '@/utils/cn';

type FoundrySection = 'discover' | 'library' | 'hardware';

const SECTIONS: { id: FoundrySection; label: string }[] = [
  { id: 'discover', label: 'Discover' },
  { id: 'library', label: 'Library' },
  { id: 'hardware', label: 'Hardware' },
];

/**
 * Model Foundry - top-level surface for discovering, acquiring, and managing
 * local AI models. Task 1 establishes the page shell + section switcher; later
 * tasks mount the Discover / Library / Hardware sections and the header.
 */
export function FoundryPage() {
  const [section, setSection] = useState<FoundrySection>('discover');

  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="max-w-5xl">
        <p className="mono-label text-text-muted">Models</p>
        <h1 className="mt-1 text-2xl font-semibold text-text-primary">Foundry</h1>
        <p className="mt-2 text-sm text-text-body">
          Discover and acquire models, manage your local library, and check how each
          model fits your hardware.
        </p>

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

        <div
          data-testid={`foundry-section-${section}`}
          className="mt-6 text-sm text-text-body"
        >
          {SECTIONS.find((s) => s.id === section)?.label} section coming online.
        </div>
      </div>
    </div>
  );
}
