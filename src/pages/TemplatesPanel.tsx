import { useState } from 'react';
import { useAppStore, PROJECT_TEMPLATES } from '@/store/appStore';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import {
  Sparkles,
  Youtube,
  Instagram,
  ShoppingBag,
  Palette,
  Check,
  ArrowRight,
  Wand2,
  Plus,
  Search,
} from 'lucide-react';
import { motion } from 'framer-motion';

const categoryIcons = {
  youtube: Youtube,
  social: Instagram,
  marketing: ShoppingBag,
  art: Palette,
};

const categoryLabels = {
  youtube: 'YouTube',
  social: 'Social Media',
  marketing: 'Marketing',
  art: 'Art & Creative',
};

const categoryColors: Record<string, string> = {
  youtube: '#e63946',
  social: '#ff6b9d',
  marketing: '#4ecdc4',
  art: '#6c5ce7',
};

export function TemplatesPanel() {
  const { setActivePanel, setCurrentProject, userTemplates } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const allTemplates = [...PROJECT_TEMPLATES, ...userTemplates];

  const filteredTemplates = allTemplates
    .filter((t) =>
      selectedCategory === 'all' ? true : t.category === selectedCategory
    )
    .filter(
      (t) =>
        !searchQuery ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const handleUseTemplate = (template: (typeof PROJECT_TEMPLATES)[0]) => {
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

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 text-red-primary" />
              <h2 className="font-display text-xl font-bold text-text-primary">
                Project Templates
              </h2>
            </div>
            <p className="text-sm text-text-body">
              Jumpstart your creation with optimized presets
            </p>
          </div>
          <Button variant="secondary" size="sm" icon={Plus}>
            Create Template
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full bg-elevated border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-red-primary focus:ring-1 focus:ring-red-primary/40 transition-all"
          />
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-display font-medium transition-all',
              selectedCategory === 'all'
                ? 'bg-red-primary text-text-primary glow-red-subtle'
                : 'bg-elevated text-text-body hover:text-text-primary hover:bg-surface'
            )}
          >
            All Templates
          </button>

          {Object.entries(categoryLabels).map(([key, label]) => {
            const Icon = categoryIcons[key as keyof typeof categoryIcons];
            const color = categoryColors[key];
            const isActive = selectedCategory === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-display font-medium transition-all',
                  isActive
                    ? 'text-text-primary'
                    : 'bg-elevated text-text-body hover:text-text-primary hover:bg-surface'
                )}
                style={
                  isActive
                    ? {
                        backgroundColor: `${color}18`,
                        color: color,
                        boxShadow: `0 0 8px ${color}25`,
                      }
                    : undefined
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTemplates.map((template, index) => {
            const color = categoryColors[template.category] || '#e63946';
            const isHovered = hoveredTemplate === template.id;
            return (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={cn(
                  'group relative p-5 rounded-xl border transition-all cursor-pointer',
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
                onClick={() => handleUseTemplate(template)}
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
                      background: `linear-gradient(135deg, ${color}15, ${color}05)`,
                      border: `1px solid ${color}20`,
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
                        className="px-2 py-0.5 rounded-full text-[10px] font-display font-medium uppercase tracking-wide"
                        style={{
                          backgroundColor: `${color}15`,
                          color: color,
                        }}
                      >
                        {categoryLabels[template.category as keyof typeof categoryLabels]}
                      </span>
                    </div>

                    <p className="text-sm text-text-body mb-3 line-clamp-2">
                      {template.description}
                    </p>

                    {/* Settings Preview */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] px-2 py-0.5 bg-surface rounded text-text-muted">
                        {template.settings.width}&times;{template.settings.height}
                      </span>
                      <span className="font-mono text-[10px] px-2 py-0.5 bg-surface rounded text-text-muted">
                        {template.settings.model}
                      </span>
                      <span className="font-mono text-[10px] px-2 py-0.5 bg-surface rounded text-text-muted">
                        {template.settings.steps} steps
                      </span>
                    </div>
                  </div>
                </div>

                {/* Use button (visible on hover) */}
                <div
                  className={cn(
                    'mt-4 transition-all',
                    isHovered ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  <Button
                    variant="primary"
                    size="sm"
                    icon={ArrowRight}
                    iconPosition="right"
                    fullWidth
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

        {/* Empty State */}
        {filteredTemplates.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <Sparkles className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-display text-sm">No templates found</p>
            <p className="text-xs text-text-muted mt-1">
              Try a different search or category
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
