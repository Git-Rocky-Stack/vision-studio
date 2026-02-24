import { useEffect, useRef } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import {
  Copy,
  Save,
  Pencil,
  Info,
  FolderOpen,
  Maximize,
  ZoomIn,
} from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  action: () => void;
  disabled?: boolean;
}

interface CanvasContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

export function CanvasContextMenu({ x, y, onClose }: CanvasContextMenuProps) {
  const { currentImage, setCurrentImage, setActivePanel } = useAppStore();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Ensure menu stays within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  const handleCopyImage = async () => {
    if (!currentImage) return;
    try {
      const response = await fetch(currentImage);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
    onClose();
  };

  const handleSaveAs = async () => {
    if (!currentImage) return;
    try {
      await window.electron.dialog.saveFile({
        defaultPath: `image-${Date.now()}.png`,
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'webp'] },
        ],
      });
    } catch (err) {
      console.error('Save failed:', err);
    }
    onClose();
  };

  const handleSendToEdit = () => {
    if (currentImage) {
      setActivePanel('edit');
    }
    onClose();
  };

  const handleOpenInExplorer = async () => {
    if (!currentImage) return;
    try {
      await window.electron.shell.showItemInFolder(currentImage);
    } catch (err) {
      console.error('Failed to open in explorer:', err);
    }
    onClose();
  };

  const sections: (MenuItem | 'divider')[][] = [
    [
      { id: 'copy', label: 'Copy Image', icon: Copy, action: handleCopyImage, disabled: !currentImage },
      { id: 'save', label: 'Save As...', icon: Save, action: handleSaveAs, disabled: !currentImage },
      { id: 'edit', label: 'Send to Edit', icon: Pencil, action: handleSendToEdit, disabled: !currentImage },
    ],
    [
      { id: 'info', label: 'Generation Info', icon: Info, action: () => { onClose(); }, disabled: !currentImage },
      { id: 'explorer', label: 'Open in Explorer', icon: FolderOpen, action: handleOpenInExplorer, disabled: !currentImage },
    ],
    [
      { id: 'fit', label: 'Zoom to Fit', icon: Maximize, action: () => { onClose(); } },
      { id: 'zoom100', label: 'Zoom to 100%', icon: ZoomIn, action: () => { onClose(); } },
    ],
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] py-1.5 bg-elevated border border-border rounded-lg shadow-cinematic"
      style={{ left: x, top: y }}
    >
      {sections.map((section, sectionIdx) => (
        <div key={sectionIdx}>
          {sectionIdx > 0 && (
            <div className="my-1.5 mx-2 h-px bg-border" />
          )}
          {section.map((item) => {
            if (item === 'divider') return null;
            const menuItem = item as MenuItem;
            const Icon = menuItem.icon;
            return (
              <button
                key={menuItem.id}
                onClick={menuItem.action}
                disabled={menuItem.disabled}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left transition-all',
                  menuItem.disabled
                    ? 'text-text-muted cursor-not-allowed opacity-50'
                    : 'text-text-primary hover:bg-red-aura hover:text-red-primary'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="font-display text-sm">{menuItem.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
