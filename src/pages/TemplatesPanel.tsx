import { useState } from 'react';
import { useAppStore, PROJECT_TEMPLATES } from '@/store/appStore';
import type { ProjectTemplate } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { hexToRgba } from '@/utils/colorUtils';
import { Button } from '@/components/ui/Button';
import { TemplatePreviewModal } from '@/components/templates/TemplatePreviewModal';
import { TemplateCreator } from '@/components/templates/TemplateCreator';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Sparkles,
  Youtube,
  Instagram,
  ShoppingBag,
  Palette,
  Check,
  ArrowRight,
  Plus,
  Search,
  Download,
  Upload,
  Grid3X3,
  List,
  ArrowUpDown,
  User,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const categoryIcons: Record<string, React.ElementType> = {
  youtube: Youtube,
  social: Instagram,
  marketing: ShoppingBag,
  art: Palette,
};

const categoryLabels: Record<string, string> = {
  youtube: 'YouTube',
  social: 'Social Media',
  marketing: 'Marketing',
  art: 'Art & Creative',
};

const categoryColors: Record<string, string> = {
  youtube: 'var(--color-category-youtube)',
  social: 'var(--color-category-social)',
  marketing: 'var(--color-category-marketing)',
  art: 'var(--color-category-art)',
};

type SortBy = 'popular' | 'newest' | 'alpha';
type ViewMode = 'cards' | 'compact';

export function TemplatesPanel() {
  const {
    setActivePanel,
    setCurrentProject,
    userTemplates,
    deleteUserTemplate,
  } = useAppStore();

  const [selectedCategory, setSelectedCategory] = useState<string | 'all' | 'mine'>('all');
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('popular');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [previewTemplate, setPreviewTemplate] = useState<ProjectTemplate | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProjectTemplate | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const allTemplates =
    selectedCategory === 'mine'
      ? userTemplates
      : [...PROJECT_TEMPLATES, ...userTemplates];

  const filteredTemplates = allTemplates
    .filter((t) => {
      if (selectedCategory === 'all' || selectedCategory === 'mine') return true;
      return t.category === selectedCategory;
    })
    .filter(
      (t) =>
        !searchQuery ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

  // Sort
  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    if (sortBy === 'alpha') return a.name.localeCompare(b.name);
    if (sortBy === 'newest') return (b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0);
    return 0; // popular — default order
  });

  const handleUseTemplate = (template: ProjectTemplate) => {
    const newProject = {
      id: crypto.randomUUID(),
      name: `${template.name} Project`,
      path: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      template: template,
    };
    setCurrentProject(newProject as any);
    setActivePanel('generate');
  };

  const handleDeleteTemplate = (templateId: string) => {
    deleteUserTemplate(templateId);
    setDeleteTargetId(null);
  };

  const handleExportTemplate = (template: ProjectTemplate) => {
    const data = JSON.stringify(template, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name.toLowerCase().replace(/\s+/g, '-')}.vst`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTemplate = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vst,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const template = JSON.parse(text) as ProjectTemplate;
        template.id = crypto.randomUUID();
        template.isCustom = true;
        useAppStore.getState().addUserTemplate(template);
      } catch (err) {
        console.error('Failed to import template:', err);
      }
    };
    input.click();
  };

  const CATEGORY_TABS: { id: string; label: string; icon?: React.ElementType }[] = [
    { id: 'all', label: 'All Templates' },
    { id: 'youtube', label: 'YouTube', icon: Youtube },
    { id: 'social', label: 'Social Media', icon: Instagram },
    { id: 'marketing', label: 'Marketing', icon: ShoppingBag },
    { id: 'art', label: 'Art & Creative', icon: Palette },
    { id: 'mine', label: 'My Templates', icon: User },
  ];

  return (
    <div className="h-full flex flex-col bg-void">
      {/* Top Bar */}
      <div className="px-6 pt-6 pb-4 border-b border-border bg-surface/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 text-accent-primary" />
              <h2 className="font-display text-xl font-bold text-text-primary">
                Project Templates
              </h2>
            </div>
            <p className="text-sm text-text-body">
              Jumpstart your creation with optimized presets
            </p>
          </div>
          <Button
            variant="cinema"
            size="sm"
            icon={Plus}
            onClick={() => {
              setEditingTemplate(null);
              setShowCreator(true);
            }}
          >
            Create Template
          </Button>
        </div>

        {/* Search + Sort + View */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full bg-elevated border border-border rounded-md pl-10 pr-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 transition-all"
            />
          </div>

          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="appearance-none bg-elevated border border-border rounded-md pl-3 pr-8 py-3 text-xs font-display text-text-primary focus:border-accent-primary transition-all cursor-pointer"
            >
              <option value="popular">Popular</option>
              <option value="newest">Newest</option>
              <option value="alpha">A-Z</option>
            </select>
            <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
          </div>

          <div className="flex items-center bg-elevated rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setViewMode('cards')}
              className={cn(
                'p-2 rounded-md transition-all',
                viewMode === 'cards'
                  ? 'bg-accent-primary text-void'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('compact')}
              className={cn(
                'p-2 rounded-md transition-all',
                viewMode === 'compact'
                  ? 'bg-accent-primary text-void'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const color = categoryColors[tab.id];
            const isActive = selectedCategory === tab.id;
            const count =
              tab.id === 'mine'
                ? userTemplates.length
                : undefined;

            return (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                aria-selected={isActive}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-display font-medium transition-all',
                  isActive && !color && 'bg-accent-primary-muted text-accent-primary border border-accent-primary-border shadow-accent-subtle',
                  isActive && color && 'text-text-primary',
                  !isActive && 'bg-elevated text-text-body hover:text-text-primary hover:bg-surface'
                )}
                style={
                  isActive && color
                    ? {
                        backgroundColor: hexToRgba(color, 0.09),
                        color: color,
                        boxShadow: `0 0 8px ${hexToRgba(color, 0.15)}`,
                      }
                    : undefined
                }
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-void/30 text-micro font-mono">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Import button for My Templates */}
        {selectedCategory === 'mine' && (
          <div className="mt-3">
            <button
              onClick={handleImportTemplate}
              className="flex items-center gap-2 text-xs font-display text-text-body hover:text-accent-primary transition-all"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Template (.vst)
            </button>
          </div>
        )}
      </div>

      {/* Templates Grid */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {sortedTemplates.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <Sparkles className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-display text-sm text-text-primary">
              {selectedCategory === 'mine'
                ? 'No custom templates yet'
                : 'No templates found'}
            </p>
            <p className="text-xs text-text-muted mt-1 mb-4">
              {selectedCategory === 'mine'
                ? 'Create your first custom template to get started'
                : 'Try a different search or category'}
            </p>
            {selectedCategory === 'mine' && (
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => {
                  setEditingTemplate(null);
                  setShowCreator(true);
                }}
              >
                Create Template
              </Button>
            )}
          </div>
        ) : viewMode === 'compact' ? (
          /* Compact List View */
          <div className="space-y-2">
            {sortedTemplates.map((template, index) => {
              const color = categoryColors[template.category] || 'var(--color-category-youtube)';
              return (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center gap-4 p-3 rounded-lg border border-border bg-elevated/50 hover:border-border-hover hover:bg-elevated transition-all cursor-pointer group"
                  onPointerDown={() => setPreviewTemplate(template)}
                  role="article"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPreviewTemplate(template);
                    }
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg"
                    style={{
                      background: `linear-gradient(135deg, ${hexToRgba(color, 0.08)}, ${hexToRgba(color, 0.02)})`,
                      border: `1px solid ${hexToRgba(color, 0.13)}`,
                    }}
                  >
                    {template.thumbnail}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-medium text-sm text-text-primary">
                        {template.name}
                      </h3>
                      <span
                        className="px-1.5 py-0.5 rounded-full text-micro font-display font-medium uppercase tracking-wide"
                        style={{
                          backgroundColor: hexToRgba(color, 0.08),
                          color: color,
                        }}
                      >
                        {categoryLabels[template.category] || template.category}
                      </span>
                      {template.isCustom && (
                        <span className="px-1.5 py-0.5 rounded-full text-micro font-display font-medium uppercase tracking-wide bg-elevated text-text-muted">
                          Custom
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-micro text-text-muted">
                        {template.settings.width}x{template.settings.height}
                      </span>
                      <span className="font-mono text-micro text-text-muted">
                        {template.settings.model}
                      </span>
                      <span className="font-mono text-micro text-text-muted">
                        {template.settings.steps} steps
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {template.isCustom && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExportTemplate(template); }}
                          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-all"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTargetId(template.id); }}
                          className="p-2 rounded-md text-text-muted hover:text-status-error hover:bg-status-error-muted transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      icon={ArrowRight}
                      iconPosition="right"
                      onClick={(e) => { e.stopPropagation(); handleUseTemplate(template); }}
                    >
                      Use
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          /* Card Grid View */
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedTemplates.map((template, index) => {
              const color = categoryColors[template.category] || 'var(--color-category-youtube)';
              const isHovered = hoveredTemplate === template.id;
              return (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    'group relative p-5 rounded-md border transition-all cursor-pointer',
                    isHovered
                      ? 'border-border-hover bg-elevated'
                      : 'border-border bg-elevated/50 hover:border-border-hover'
                  )}
                  style={
                    isHovered
                      ? { boxShadow: `0 0 20px ${color}10, 0 4px 12px rgba(0,0,0,0.3)` }
                      : undefined
                  }
                  onMouseEnter={() => setHoveredTemplate(template.id)}
                  onMouseLeave={() => setHoveredTemplate(null)}
                  onPointerDown={() => setPreviewTemplate(template)}
                  role="article"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPreviewTemplate(template);
                    }
                  }}
                >
                  {/* Category color accent */}
                  <div
                    className="absolute top-0 left-5 right-5 h-px"
                    style={{
                      background: isHovered
                        ? `linear-gradient(90deg, transparent, ${color}60, transparent)`
                        : 'transparent',
                    }}
                  />

                  <div className="flex items-start gap-4">
                    {/* Thumbnail */}
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl"
                      style={{
                        background: `linear-gradient(135deg, ${hexToRgba(color, 0.08)}, ${hexToRgba(color, 0.02)})`,
                        border: `1px solid ${hexToRgba(color, 0.13)}`,
                      }}
                    >
                      {template.thumbnail}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-display font-semibold text-text-primary">
                          {template.name}
                        </h3>
                        <span
                          className="px-2 py-0.5 rounded-full text-micro font-display font-medium uppercase tracking-wide"
                          style={{
                            backgroundColor: hexToRgba(color, 0.08),
                            color: color,
                          }}
                        >
                          {categoryLabels[template.category] || template.category}
                        </span>
                      </div>

                      <p className="text-sm text-text-body mb-3 line-clamp-2">
                        {template.description}
                      </p>

                      {/* Settings Preview */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-micro px-2 py-0.5 bg-surface rounded text-text-muted">
                          {template.settings.width}&times;{template.settings.height}
                        </span>
                        <span className="font-mono text-micro px-2 py-0.5 bg-surface rounded text-text-muted">
                          {template.settings.model}
                        </span>
                        <span className="font-mono text-micro px-2 py-0.5 bg-surface rounded text-text-muted">
                          {template.settings.steps} steps
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions (visible on hover) */}
                  <div
                    className={cn(
                      'mt-4 flex gap-2 transition-all',
                      isHovered ? 'opacity-100' : 'opacity-0'
                    )}
                  >
                    {template.isCustom && (
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExportTemplate(template); }}
                          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-all"
                          title="Export"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTargetId(template.id); }}
                          className="p-2 rounded-md text-text-muted hover:text-status-error hover:bg-status-error-muted transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex-1" />
                    <Button
                      variant="primary"
                      size="sm"
                      icon={ArrowRight}
                      iconPosition="right"
                      onClick={(e) => { e.stopPropagation(); handleUseTemplate(template); }}
                    >
                      Use Template
                    </Button>
                  </div>

                  {/* Aspect ratio ghost */}
                  <div className="absolute top-5 right-5 opacity-5 pointer-events-none">
                    <div
                      className="border-2 border-text-primary rounded"
                      style={{
                        width:
                          template.settings.width > template.settings.height
                            ? '60px'
                            : '36px',
                        height:
                          template.settings.width > template.settings.height
                            ? '36px'
                            : '60px',
                      }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {previewTemplate && (
          <TemplatePreviewModal
            template={previewTemplate}
            onClose={() => setPreviewTemplate(null)}
            onUseTemplate={(t) => {
              setPreviewTemplate(null);
              handleUseTemplate(t);
            }}
            onEditTemplate={(t) => {
              setPreviewTemplate(null);
              setEditingTemplate(t);
              setShowCreator(true);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreator && (
          <TemplateCreator
            onClose={() => {
              setShowCreator(false);
              setEditingTemplate(null);
            }}
            editingTemplate={editingTemplate}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Delete Template"
        message="Are you sure you want to delete this custom template? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteTargetId && handleDeleteTemplate(deleteTargetId)}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
