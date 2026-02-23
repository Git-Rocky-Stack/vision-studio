import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { 
  Save, 
  FolderOpen, 
  Undo, 
  Redo, 
  Play,
  Download,
  MoreHorizontal,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { motion } from 'framer-motion';

export function Header() {
  const { currentProject } = useAppStore();

  return (
    <header className="h-14 bg-charcoal border-b border-border flex items-center justify-between px-4">
      {/* Left - Project Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {currentProject ? (
            <>
              <span className="font-medium text-white">{currentProject.name}</span>
              <span className="text-xs text-silver">•</span>
              <span className="text-xs text-silver">Edited just now</span>
            </>
          ) : (
            <span className="text-silver">Untitled Project</span>
          )}
        </div>
      </div>

      {/* Center - Actions */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-charcoal-lighter rounded-lg p-1 border border-border">
          <button 
            className="p-1.5 rounded text-silver hover:text-white hover:bg-charcoal-light transition-all"
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button 
            className="p-1.5 rounded text-silver hover:text-white hover:bg-charcoal-light transition-all"
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </button>
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

        <button className="p-2 rounded-lg text-silver hover:text-white hover:bg-charcoal-lighter transition-all">
          <MoreHorizontal className="w-5 h-5" />
        </button>

        <button className="w-8 h-8 rounded-full bg-gradient-to-br from-red to-red-hover flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </button>
      </div>
    </header>
  );
}
