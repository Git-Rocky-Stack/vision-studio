import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface WorkbenchRightStackSection {
  id: string;
  label: string;
  content: ReactNode;
  defaultHeight?: string;
  defaultCollapsed?: boolean;
}

interface WorkbenchRightStackProps {
  sections: WorkbenchRightStackSection[];
}

export function WorkbenchRightStack({ sections }: WorkbenchRightStackProps) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((section) => [section.id, Boolean(section.defaultCollapsed)]))
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {sections.map((section) => {
        const isCollapsed = Boolean(collapsedSections[section.id]);

        return (
          <section
            key={section.id}
            className={`flex min-h-0 flex-col border-b border-border last:border-b-0 ${isCollapsed ? 'flex-none' : 'flex-1'}`}
            style={!isCollapsed && section.defaultHeight ? { flexBasis: section.defaultHeight } : undefined}
          >
            <button
              type="button"
              aria-expanded={!isCollapsed}
              className="flex h-9 flex-shrink-0 items-center justify-between border-b border-border px-3 text-left type-ui text-text-body"
              onClick={() =>
                setCollapsedSections((current) => ({
                  ...current,
                  [section.id]: !current[section.id],
                }))
              }
            >
              <span>{section.label}</span>
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              )}
            </button>
            {!isCollapsed ? <div className="min-h-0 flex-1 overflow-hidden">{section.content}</div> : null}
          </section>
        );
      })}
    </div>
  );
}
