import { memo } from 'react';
import { useAppStore } from '@/store/appStore';
import {
  Save,
  FolderOpen,
  Undo,
  Redo,
  Play,
  Download,
  MoreHorizontal,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';

export const Header = memo(function Header() {
  const { currentProject, editHistory, editHistoryIndex, undo, redo } = useAppStore();
  const canUndo = editHistoryIndex > 0;
  const canRedo = editHistoryIndex < editHistory.length - 1;

  return (
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4">
      {/* Left - Project Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {currentProject ? (
            <>
              <span className="font-display font-medium text-text-primary">{currentProject.name}</span>
              <span className="text-xs text-text-muted">&middot;</span>
              <span className="text-xs text-text-muted">
                {currentProject.updatedAt
                  ? `Edited ${new Date(currentProject.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Unsaved changes'}
              </span>
            </>
          ) : (
            <span className="font-display text-text-body">Untitled Project</span>
          )}
        </div>
      </div>

      {/* Center - Actions */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-elevated rounded-lg p-1 border border-border">
          <Tooltip content="Undo" placement="bottom">
            <button
              className="p-1.5 rounded text-text-body hover:text-text-primary hover:bg-surface transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-body disabled:hover:bg-transparent"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Redo" placement="bottom">
            <button
              className="p-1.5 rounded text-text-body hover:text-text-primary hover:bg-surface transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-body disabled:hover:bg-transparent"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={redo}
            >
              <Redo className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        <div className="w-px h-6 bg-border mx-2" />

        <Button variant="secondary" size="sm" icon={FolderOpen}>
          Open
        </Button>
        <Button variant="secondary" size="sm" icon={Save}>
          Save
        </Button>
      </div>

      {/* Right - Export & Profile */}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          icon={Play}
          iconPosition="left"
        >
          Preview
        </Button>

        <Button
          variant="secondary"
          size="sm"
          icon={Download}
        >
          Export
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <button aria-label="More options" className="p-2 rounded-lg text-text-body hover:text-text-primary hover:bg-elevated transition-all">
          <MoreHorizontal className="w-5 h-5" />
        </button>

        <button aria-label="User profile" className="w-8 h-8 rounded-full bg-gradient-to-br from-red-primary to-red-pressed flex items-center justify-center glow-red-subtle">
          <User className="w-4 h-4 text-text-primary" />
        </button>
      </div>
    </header>
  );
});
