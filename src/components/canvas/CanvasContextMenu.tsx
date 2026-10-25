import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { pipelineUnsupportedReason, startPipelineRun } from '@/features/pipeline/runPipelineExecution';
import { pushNotice, reportActionError } from '@/features/notices';
import {
  Copy,
  Save,
  Pencil,
  Info,
  FolderOpen,
  Maximize,
  ZoomIn,
  Sparkles,
} from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  action: () => void;
  disabled?: boolean;
  /** Why the item is disabled, shown as its tooltip. */
  reason?: string;
}

interface CanvasContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  /** Open the generation metadata for the current image; omitted when there is none. */
  onShowGenerationInfo?: () => void;
  onZoomToFit?: () => void;
  onZoom100?: () => void;
}

export function CanvasContextMenu({
  x,
  y,
  onClose,
  onShowGenerationInfo,
  onZoomToFit,
  onZoom100,
}: CanvasContextMenuProps) {
  const { currentImage, currentImageAssetPath, setActiveTab, pipelines } = useAppStore(
    useShallow((s) => ({
      currentImage: s.currentImage,
      currentImageAssetPath: s.currentImageAssetPath,
      setActiveTab: s.setActiveTab,
      pipelines: s.pipelines,
    }))
  );
  const menuRef = useRef<HTMLDivElement>(null);
  // A failed action keeps the menu open with the reason, instead of closing
  // as if it had worked.
  const [actionError, setActionError] = useState<string | null>(null);

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

    requestAnimationFrame(() => {
      const firstItem = menuRef.current?.querySelector<HTMLElement>('button:not([disabled])');
      firstItem?.focus();
    });

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
      if (!response.ok) throw new Error(`the image could not be read (${response.status})`);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
    } catch (err) {
      setActionError(`Copy failed: ${err instanceof Error ? err.message : 'clipboard unavailable'}`);
      return;
    }
    onClose();
  };

  const handleSaveAs = async () => {
    if (!currentImageAssetPath) return;
    try {
      const destinationPath = await window.electron.dialog.saveFile({
        defaultPath: currentImageAssetPath.split('/').pop() || `image-${Date.now()}.png`,
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'webp'] },
        ],
      });

      if (destinationPath) {
        const result = await window.electron.assets.export(currentImageAssetPath, destinationPath);
        if (!result?.success) {
          setActionError(`Save failed: ${result?.error ?? 'the file could not be written'}`);
          return;
        }
      }
    } catch (err) {
      setActionError(`Save failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      return;
    }
    onClose();
  };

  const handleSendToEdit = () => {
    if (currentImage) {
      setActiveTab('canvas');
    }
    onClose();
  };

  const handleOpenInExplorer = async () => {
    if (!currentImageAssetPath) return;
    try {
      const result = await window.electron.assets.reveal(currentImageAssetPath);
      if (result && !result.success) {
        setActionError(`Could not open the folder: ${result.error ?? 'unknown error'}`);
        return;
      }
    } catch (err) {
      setActionError(`Could not open the folder: ${err instanceof Error ? err.message : 'unknown error'}`);
      return;
    }
    onClose();
  };

  // Refine runs the pipeline for real (startPipelineRun). The menu closes
  // immediately, so the outcome is reported as a notice.
  const refineItems: MenuItem[] = pipelines.map((p) => {
    const unsupported = pipelineUnsupportedReason(p);
    return {
      id: `refine-${p.id}`,
      label: p.name,
      icon: Sparkles,
      action: () => {
        if (currentImageAssetPath && !unsupported) {
          const sourcePath = currentImageAssetPath;
          void startPipelineRun(p.id, sourcePath).then((result) => {
            if (result.status === 'error') {
              reportActionError(`${p.name} failed: ${result.error ?? 'unknown error'}`);
            } else if (result.status === 'complete') {
              pushNotice('success', `${p.name} finished. The result is on the Edit canvas.`);
            }
          });
        }
        onClose();
      },
      disabled: !currentImageAssetPath || Boolean(unsupported),
      reason: unsupported ?? (!currentImageAssetPath ? 'Needs an image saved in Assets.' : undefined),
    };
  });

  const sections: (MenuItem | 'divider')[][] = [
    [
      { id: 'copy', label: 'Copy Image', icon: Copy, action: handleCopyImage, disabled: !currentImage },
      { id: 'save', label: 'Save As...', icon: Save, action: handleSaveAs, disabled: !currentImageAssetPath },
      { id: 'edit', label: 'Send to Edit', icon: Pencil, action: handleSendToEdit, disabled: !currentImage },
    ],
    refineItems.length > 0
      ? [{ id: 'refine-header' as const, label: 'Refine', icon: Sparkles, action: () => {}, disabled: true }, ...refineItems]
      : [],
    [
      {
        id: 'info',
        label: 'Generation Info',
        icon: Info,
        action: () => {
          onShowGenerationInfo?.();
          onClose();
        },
        disabled: !currentImage || !onShowGenerationInfo,
        reason: currentImage && !onShowGenerationInfo ? 'No generation record for this image.' : undefined,
      },
      { id: 'explorer', label: 'Open in Explorer', icon: FolderOpen, action: handleOpenInExplorer, disabled: !currentImageAssetPath },
    ],
    [
      {
        id: 'fit',
        label: 'Zoom to Fit',
        icon: Maximize,
        action: () => {
          onZoomToFit?.();
          onClose();
        },
        disabled: !onZoomToFit,
      },
      {
        id: 'zoom100',
        label: 'Zoom to 100%',
        icon: ZoomIn,
        action: () => {
          onZoom100?.();
          onClose();
        },
        disabled: !onZoom100,
      },
    ],
  ];

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Canvas context menu"
      onKeyDown={(e) => {
        const items = menuRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
        if (!items || items.length === 0) return;
        const currentIdx = Array.from(items).indexOf(document.activeElement as HTMLElement);

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
          items[next]?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
          items[prev]?.focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          items[0]?.focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          items[items.length - 1]?.focus();
        } else if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
          // Type-ahead: focus next item starting with typed letter
          const letter = e.key.toLowerCase();
          const startIdx = currentIdx + 1;
          const allItems = Array.from(items);
          const reordered = [...allItems.slice(startIdx), ...allItems.slice(0, startIdx)];
          const match = reordered.find((item) =>
            item.textContent?.trim().toLowerCase().startsWith(letter)
          );
          if (match) match.focus();
        }
      }}
      className="fixed z-50 min-w-[200px] py-1.5 bg-elevated border border-border rounded-xl shadow-cinematic"
      style={{ left: x, top: y }}
    >
      {actionError && (
        <p role="alert" className="mx-2 mb-1 max-w-[240px] rounded-md px-2 py-1.5 type-caption text-status-error">
          {actionError}
        </p>
      )}
      {sections.map((section, sectionIdx) => (
        <div key={sectionIdx} role="presentation">
          {sectionIdx > 0 && (
            <div className="my-2 mx-2 h-px bg-border" role="separator" />
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
                role="menuitem"
                aria-disabled={menuItem.disabled}
                title={menuItem.reason}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left transition',
                  menuItem.disabled
                    ? 'text-text-muted cursor-not-allowed opacity-50'
                    : 'text-text-primary hover:bg-accent-primary-muted hover:text-accent-primary'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{menuItem.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
