import { memo } from 'react';
import { MonoLabel } from '@/components/hardware';
import { WorkbenchGalleryDock } from './WorkbenchGalleryDock';

export const DockviewGalleryPanel = memo(function DockviewGalleryPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="faceplate-stripe flex h-9 flex-shrink-0 items-center px-3">
        <MonoLabel as="h2" tone="chrome">Gallery</MonoLabel>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkbenchGalleryDock />
      </div>
    </div>
  );
});