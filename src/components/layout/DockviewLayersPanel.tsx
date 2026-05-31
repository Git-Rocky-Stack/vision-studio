import { memo } from 'react';
import { MonoLabel } from '@/components/hardware';
import { LayerPanel } from '@/components/edit/LayerPanel';

export const DockviewLayersPanel = memo(function DockviewLayersPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="faceplate-stripe flex h-9 flex-shrink-0 items-center px-3">
        <MonoLabel as="h2" tone="chrome">Layers</MonoLabel>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <LayerPanel />
      </div>
    </div>
  );
});