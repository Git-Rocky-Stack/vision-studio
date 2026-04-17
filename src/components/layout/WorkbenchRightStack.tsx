import type { ReactNode } from 'react';

interface WorkbenchRightStackSection {
  id: string;
  label: string;
  content: ReactNode;
  defaultHeight?: string;
}

interface WorkbenchRightStackProps {
  sections: WorkbenchRightStackSection[];
}

export function WorkbenchRightStack({ sections }: WorkbenchRightStackProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {sections.map((section) => (
        <section
          key={section.id}
          className="flex min-h-0 flex-1 flex-col border-b border-border last:border-b-0"
          style={section.defaultHeight ? { flexBasis: section.defaultHeight } : undefined}
        >
          <button
            type="button"
            className="flex h-9 flex-shrink-0 items-center justify-between border-b border-border px-3 text-left font-display text-xs font-semibold text-text-body"
          >
            {section.label}
          </button>
          <div className="min-h-0 flex-1 overflow-hidden">{section.content}</div>
        </section>
      ))}
    </div>
  );
}
