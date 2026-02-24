import { useState, useRef, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store/appStore';
import {
  Clock,
  Search,
  Heart,
  Trash2,
  X,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PromptHistoryEntry } from '@/types/generation';

interface PromptHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string, negativePrompt: string) => void;
}

export function PromptHistory({
  isOpen,
  onClose,
  onSelectPrompt,
}: PromptHistoryProps) {
  const { promptHistory, favoritePrompts, toggleFavoritePrompt } =
    useAppStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  const filtered = promptHistory.filter((entry) => {
    const matchesSearch =
      !search ||
      entry.prompt.toLowerCase().includes(search.toLowerCase()) ||
      entry.negativePrompt?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === 'all' || favoritePrompts.includes(entry.prompt);
    return matchesSearch && matchesFilter;
  });

  const formatTimestamp = (ts: Date) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="absolute left-0 right-0 top-full mt-2 z-40 bg-elevated border border-border rounded-xl shadow-cinematic overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-primary" />
              <span className="text-label text-text-primary">
                Prompt History
              </span>
              <span className="font-mono text-[10px] text-text-muted">
                {promptHistory.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search + Filter */}
          <div className="px-4 py-2 border-b border-border flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompts..."
                className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-red-primary focus:ring-1 focus:ring-red-primary/40 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="flex gap-0.5">
              <button
                onClick={() => setFilter('all')}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-[10px] font-display transition-all',
                  filter === 'all'
                    ? 'bg-red-aura text-red-primary'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface'
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilter('favorites')}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-[10px] font-display flex items-center gap-1 transition-all',
                  filter === 'favorites'
                    ? 'bg-red-aura text-red-primary'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface'
                )}
              >
                <Heart className="w-2.5 h-2.5" />
                Favorites
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto scrollbar-hide">
            {filtered.length === 0 ? (
              <div className="py-10 text-center">
                <Sparkles className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-20" />
                <p className="text-xs text-text-muted font-display">
                  {promptHistory.length === 0
                    ? 'No history yet'
                    : 'No matching prompts'}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {promptHistory.length === 0
                    ? 'Generate an image to build your history'
                    : 'Try a different search term'}
                </p>
              </div>
            ) : (
              filtered.map((entry) => (
                <PromptHistoryRow
                  key={entry.id}
                  entry={entry}
                  isFavorite={favoritePrompts.includes(entry.prompt)}
                  onSelect={() =>
                    onSelectPrompt(entry.prompt, entry.negativePrompt)
                  }
                  onToggleFavorite={() => toggleFavoritePrompt(entry.prompt)}
                  formatTimestamp={formatTimestamp}
                />
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Row ─────────────────────────────────────────────── */

function PromptHistoryRow({
  entry,
  isFavorite,
  onSelect,
  onToggleFavorite,
  formatTimestamp,
}: {
  entry: PromptHistoryEntry;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  formatTimestamp: (ts: Date) => string;
}) {
  return (
    <div
      onClick={onSelect}
      className="group flex items-start gap-3 px-4 py-3 hover:bg-surface/60 transition-all cursor-pointer border-b border-border/50 last:border-b-0"
    >
      {/* Thumbnail */}
      {entry.result ? (
        <div className="w-10 h-10 rounded-lg bg-surface border border-border flex-shrink-0 overflow-hidden">
          <img
            src={entry.result}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-lg bg-surface border border-border flex-shrink-0 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-text-muted/30" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary font-display line-clamp-2 leading-relaxed">
          {entry.prompt}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-mono text-[9px] text-text-muted">
            {formatTimestamp(entry.timestamp)}
          </span>
          {entry.model && (
            <>
              <span className="text-text-muted/30">&middot;</span>
              <span className="font-mono text-[9px] text-text-muted">
                {entry.model}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={cn(
            'p-1 rounded-md transition-all',
            isFavorite
              ? 'text-red-primary'
              : 'text-text-muted hover:text-red-primary'
          )}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart
            className="w-3 h-3"
            fill={isFavorite ? 'currentColor' : 'none'}
          />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="p-1 rounded-md text-text-muted hover:text-text-primary transition-all"
          title="Use this prompt"
        >
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
