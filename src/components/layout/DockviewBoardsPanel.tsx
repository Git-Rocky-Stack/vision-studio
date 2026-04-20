import { memo } from 'react';
import { WorkbenchBoardsDock } from './WorkbenchBoardsDock';

export const DockviewBoardsPanel = memo(function DockviewBoardsPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 flex-shrink-0 items-center border-b border-border px-3">
        <h2 className="type-ui text-text-primary">Boards</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkbenchBoardsDock />
      </div>
    </div>
  );
});