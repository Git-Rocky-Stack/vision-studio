import { EditPropertiesPanel } from '@/components/edit/EditPropertiesPanel';

export function EditPanel() {
  // The EditPanel is now a thin wrapper.
  // In WorkspaceLayout edit mode, ToolStrip and EditPropertiesPanel
  // are placed in their respective layout slots.
  // This component serves as the right-side properties panel.
  return <EditPropertiesPanel />;
}
