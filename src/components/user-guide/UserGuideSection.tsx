import type { ReactNode } from 'react';

interface UserGuideSectionProps {
  id: string;
  title: string;
  summary: string;
  children: ReactNode;
}

export function UserGuideSection({ id, title, summary, children }: UserGuideSectionProps) {
  return (
    <section
      id={id}
      role="region"
      aria-labelledby={`${id}-heading`}
      className="border-b border-border py-6 first:pt-0 last:border-b-0"
    >
      <div className="max-w-3xl">
        <h2 id={`${id}-heading`} className="font-display text-lg font-semibold text-text-primary">
          {title}
        </h2>
        <p className="mt-1 text-sm text-text-body">{summary}</p>
        <div className="mt-4 space-y-3 text-sm text-text-body">{children}</div>
      </div>
    </section>
  );
}
