import { EditPropertiesPanel } from '@/components/edit/EditPropertiesPanel';

export function EditPanel() {
  // The EditPanel is a thin wrapper for the right-side properties panel
  // in the Dockview layout. ToolStrip and EditPropertiesPanel are placed
  // in their respective layout slots.
  return (
    <>
      <h1 className="sr-only">Edit</h1>
      <EditPropertiesPanel />
    </>
  );
}
