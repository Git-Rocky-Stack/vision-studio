import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, PROJECT_TEMPLATES } from '@/store/appStore';
import type { ProjectTemplate } from '@/types/template';
import { cn } from '@/utils/cn';
import { TemplatePreviewModal } from '@/components/templates/TemplatePreviewModal';
import { TemplateCreator } from '@/components/templates/TemplateCreator';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Faceplate,
  RecessedWell,
  PadButton,
  MonoLabel,
  Led,
  Lcd,
  ChromeButton,
} from '@/components/hardware';
import {
  Youtube,
  Instagram,
  ShoppingBag,
  Palette,
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

const categoryLabels: Record<string, string> = {
  youtube: 'YouTube',
  social: 'Social Media',
  marketing: 'Marketing',
  art: 'Art & Creative',
};

/** Category accent hue (CSS var). Drives a pinpoint LED + selected ring only - never a fill. */
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
    setActiveTab,
    setCurrentProject,
    userTemplates,
    deleteUserTemplate,
  } = useAppStore(useShallow(s => ({
    setActiveTab: s.setActiveTab,
    setCurrentProject: s.setCurrentProject,
    userTemplates: s.userTemplates,
    deleteUserTemplate: s.deleteUserTemplate,
  })));

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
    return 0; // popular - default order
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
    setCurrentProject(newProject);
    setActiveTab('generate');
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
    { id: 'social', label: 'Social', icon: Instagram },
    { id: 'marketing', label: 'Marketing', icon: ShoppingBag },
    { id: 'art', label: 'Art & Creative', icon: Palette },
    { id: 'mine', label: 'My Templates', icon: User },
  ];

  return (
    <div
      className="h-full flex flex-col bg-void"
      data-testid="templates-panel"
      style={{ padding: 'var(--space-3)', gap: 'var(--space-3)' }}
    >
      <h1 className="sr-only">Templates</h1>

      {/* ── Control deck faceplate ─────────────────────────────────── */}
      <Faceplate
        kicker="MOD - TEMPLATES - 01"
        serial="S/N - VX-TPL-0001"
        stateLed="play"
        stateLabel="READY"
        bodyPadding={16}
        className="flex-shrink-0"
      >
        {/* Title row */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <Lcd color="play" size="lg">{sortedTemplates.length} LOADED</Lcd>
          <ChromeButton
            onClick={() => {
              setEditingTemplate(null);
              setShowCreator(true);
            }}
            style={{ padding: '10px 18px', fontSize: 12 }}
          >
            <Plus className="w-3.5 h-3.5" />
            Create Template
          </ChromeButton>
        </div>
        <p className="text-sm text-text-body mb-4">
          Jumpstart your creation with optimized presets
        </p>

        {/* Search + Sort + View */}
        <div className="flex items-center gap-3 mb-4">
          <RecessedWell padding={0} className="flex-1 flex items-center focus-within:ring-1 focus-within:ring-accent-primary">
            <Search className="ml-3 w-4 h-4 text-text-muted flex-shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full bg-transparent border-0 outline-none px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted font-mono"
            />
          </RecessedWell>

          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="raised-control appearance-none pl-3 pr-8 py-2.5 data-mono text-text-primary cursor-pointer"
              style={{ borderRadius: 'var(--radius-control)' }}
              aria-label="Sort templates"
            >
              <option value="popular">POPULAR</option>
              <option value="newest">NEWEST</option>
              <option value="alpha">A-Z</option>
            </select>
            <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted pointer-events-none" />
          </div>

          <RecessedWell padding={2} className="flex items-center gap-0.5">
            <PadButton
              size="sm"
              selected={viewMode === 'cards'}
              onClick={() => setViewMode('cards')}
              aria-label="Card view"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </PadButton>
            <PadButton
              size="sm"
              selected={viewMode === 'compact'}
              onClick={() => setViewMode('compact')}
              aria-label="Compact view"
            >
              <List className="w-3.5 h-3.5" />
            </PadButton>
          </RecessedWell>
        </div>

        {/* Category pad bank */}
        <div className="flex flex-wrap gap-2">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const color = categoryColors[tab.id];
            const isActive = selectedCategory === tab.id;
            const count = tab.id === 'mine' ? userTemplates.length : undefined;

            return (
              <PadButton
                key={tab.id}
                selected={isActive}
                accent={color}
                led={isActive && color ? color : undefined}
                onClick={() => setSelectedCategory(tab.id)}
                aria-selected={isActive}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span className="data-mono text-text-muted">{count}</span>
                )}
              </PadButton>
            );
          })}
        </div>

        {/* Import for My Templates */}
        {selectedCategory === 'mine' && (
          <div className="mt-3">
            <button
              onClick={handleImportTemplate}
              className="inline-flex items-center gap-2 mono-label text-text-body hover:text-accent-primary transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Template (.vst)
            </button>
          </div>
        )}
      </Faceplate>

      {/* ── Template grid bay (recessed) ───────────────────────────── */}
      <RecessedWell padding={16} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {sortedTemplates.length === 0 ? (
          /* Empty state */
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-16">
            <Led color="cue" size={10} pulse />
            <MonoLabel tone="silver" style={{ fontSize: 13 }}>
              {selectedCategory === 'mine' ? 'No custom templates yet' : 'No templates found'}
            </MonoLabel>
            <p className="text-xs text-text-muted max-w-xs">
              {selectedCategory === 'mine'
                ? 'Create your first custom template to get started'
                : 'Try a different search or category'}
            </p>
            {selectedCategory === 'mine' && (
              <ChromeButton
                onClick={() => {
                  setEditingTemplate(null);
                  setShowCreator(true);
                }}
                style={{ padding: '10px 18px', fontSize: 12, marginTop: 8 }}
              >
                <Plus className="w-3.5 h-3.5" />
                Create Template
              </ChromeButton>
            )}
          </div>
        ) : viewMode === 'compact' ? (
          /* Compact list view */
          <div className="flex flex-col gap-2">
            {sortedTemplates.map((template, index) => {
              const color = categoryColors[template.category] || 'var(--color-accent-primary)';
              return (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="raised-control vx-model-card flex items-center gap-4 px-3 py-2.5 cursor-pointer group"
                  style={{ borderRadius: 'var(--radius-control)' }}
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
                  <ThumbWell template={template} color={color} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm text-text-primary truncate">
                        {template.name}
                      </h3>
                      <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                        <Led color={color} size={6} />
                        <MonoLabel tone="muted">
                          {categoryLabels[template.category] || template.category}
                        </MonoLabel>
                      </span>
                      {template.isCustom && <MonoLabel tone="muted">Custom</MonoLabel>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 data-mono text-text-muted">
                      <span>{template.settings.width}x{template.settings.height}</span>
                      <span>{template.settings.model}</span>
                      <span>{template.settings.steps} steps</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {template.isCustom && (
                      <>
                        <IconButton title="Export" onClick={(e) => { e.stopPropagation(); handleExportTemplate(template); }}>
                          <Download className="w-3.5 h-3.5" />
                        </IconButton>
                        <IconButton title="Delete" danger onClick={(e) => { e.stopPropagation(); setDeleteTargetId(template.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </IconButton>
                      </>
                    )}
                    <ChromeButton
                      onClick={(e) => { e.stopPropagation(); handleUseTemplate(template); }}
                      style={{ padding: '7px 12px', fontSize: 11 }}
                    >
                      Use
                      <ArrowRight className="w-3.5 h-3.5" />
                    </ChromeButton>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          /* Card grid view - container-responsive columns (dock panes are narrow
             regardless of viewport width, so viewport breakpoints are wrong here) */
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
          >
            {sortedTemplates.map((template, index) => {
              const color = categoryColors[template.category] || 'var(--color-accent-primary)';
              const isHovered = hoveredTemplate === template.id;
              return (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="raised-control vx-model-card group relative p-4 cursor-pointer"
                  style={{ borderRadius: 'var(--radius-card)' }}
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
                  <div className="flex items-start gap-4">
                    <ThumbWell template={template} color={color} size={56} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-text-primary truncate">
                        {template.name}
                      </h3>
                      <span className="inline-flex items-center gap-1.5 mt-1">
                        <Led color={color} size={6} />
                        <MonoLabel tone="muted">
                          {categoryLabels[template.category] || template.category}
                        </MonoLabel>
                      </span>
                      <p className="text-sm text-text-body mt-2 line-clamp-2">
                        {template.description}
                      </p>
                    </div>
                  </div>

                  {/* Spec strip */}
                  <RecessedWell padding={8} className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <SpecCell label="DIMS" value={`${template.settings.width}x${template.settings.height}`} />
                    <SpecCell label="MODEL" value={template.settings.model} />
                    <SpecCell label="STEPS" value={String(template.settings.steps)} />
                  </RecessedWell>

                  {/* Actions */}
                  <div
                    className={cn(
                      'mt-3 flex items-center gap-2 transition-opacity',
                      isHovered ? 'opacity-100' : 'opacity-0'
                    )}
                  >
                    {template.isCustom && (
                      <>
                        <IconButton title="Export" onClick={(e) => { e.stopPropagation(); handleExportTemplate(template); }}>
                          <Download className="w-3.5 h-3.5" />
                        </IconButton>
                        <IconButton title="Delete" danger onClick={(e) => { e.stopPropagation(); setDeleteTargetId(template.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </IconButton>
                      </>
                    )}
                    <div className="flex-1" />
                    <ChromeButton
                      onClick={(e) => { e.stopPropagation(); handleUseTemplate(template); }}
                      style={{ padding: '8px 14px', fontSize: 11 }}
                    >
                      Use Template
                      <ArrowRight className="w-3.5 h-3.5" />
                    </ChromeButton>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </RecessedWell>

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

/** Recessed CRT thumbnail viewport: template short-code in mono + a category LED. */
function ThumbWell({ template, color, size }: { template: ProjectTemplate; color: string; size: number }) {
  return (
    <RecessedWell
      padding={0}
      className="relative flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span
        className="data-mono"
        style={{ color: 'var(--color-silver)', fontSize: Math.max(10, size / 4.5) }}
      >
        {template.thumbnail}
      </span>
      <Led color={color} size={5} style={{ position: 'absolute', top: 4, right: 4 }} />
    </RecessedWell>
  );
}

/** A single MONO spec cell: label + value, label muted, value silver. */
function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      <MonoLabel tone="muted" style={{ fontSize: 9 }}>{label}</MonoLabel>
      <span className="data-mono text-text-body truncate">{value}</span>
    </span>
  );
}

/** Small raised icon control for row/card actions. */
function IconButton({
  children,
  title,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  danger?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'raised-control vx-switch p-2 text-text-muted transition-colors',
        danger ? 'hover:text-status-error' : 'hover:text-text-primary'
      )}
      style={{ borderRadius: 'var(--radius-control)' }}
    >
      {children}
    </button>
  );
}
