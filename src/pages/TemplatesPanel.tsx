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
  Wand2
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

export function TemplatesPanel() {
  const { setActivePanel, currentProject, setCurrentProject } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);

  const filteredTemplates = selectedCategory === 'all' 
    ? PROJECT_TEMPLATES 
    : PROJECT_TEMPLATES.filter(t => t.category === selectedCategory);

  const handleUseTemplate = (template: typeof PROJECT_TEMPLATES[0]) => {
    // Create a new project with template settings
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-red" />
          <h2 className="text-lg font-semibold text-white">Project Templates</h2>
        </div>
        <p className="text-sm text-silver">
          Jumpstart your creation with optimized presets
        </p>
      </div>

      {/* Category Filter */}
      <div className="p-4 border-b border-border">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
              selectedCategory === 'all'
                ? 'bg-red text-white'
                : 'bg-charcoal-lighter text-silver hover:text-white hover:bg-charcoal-light'
            )}
          >
            All Templates
          </button>
          
          {Object.entries(categoryLabels).map(([key, label]) => {
            const Icon = categoryIcons[key as keyof typeof categoryIcons];
            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                  selectedCategory === key
                    ? 'bg-red text-white'
                    : 'bg-charcoal-lighter text-silver hover:text-white hover:bg-charcoal-light'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-3">
          {filteredTemplates.map((template, index) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                'group relative p-4 rounded-xl border transition-all cursor-pointer',
                hoveredTemplate === template.id
                  ? 'border-red bg-red/5'
                  : 'border-border bg-charcoal-lighter hover:border-border-hover'
              )}
              onMouseEnter={() => setHoveredTemplate(template.id)}
              onMouseLeave={() => setHoveredTemplate(null)}
            >
              <div className="flex items-start gap-4">
                {/* Icon/Thumbnail */}
                <div className="w-16 h-16 rounded-xl bg-charcoal border border-border flex items-center justify-center flex-shrink-0">
                  <span className="text-3xl">{template.thumbnail}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-white">{template.name}</h3>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide',
                      template.category === 'youtube' && 'bg-red/20 text-red',
                      template.category === 'social' && 'bg-pink-500/20 text-pink-400',
                      template.category === 'marketing' && 'bg-blue-500/20 text-blue-400',
                      template.category === 'art' && 'bg-purple-500/20 text-purple-400',
                    )}>
                      {categoryLabels[template.category]}
                    </span>
                  </div>
                  
                  <p className="text-sm text-silver mb-3">{template.description}</p>
                  
                  {/* Settings Preview */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-silver/70">
                    <span className="px-2 py-1 bg-charcoal rounded">
                      {template.settings.width}×{template.settings.height}
                    </span>
                    <span className="px-2 py-1 bg-charcoal rounded">
                      {template.settings.model}
                    </span>
                    <span className="px-2 py-1 bg-charcoal rounded">
                      {template.settings.steps} steps
                    </span>
                  </div>
                </div>

                {/* Action Button */}
                <div className="flex-shrink-0">
                  <Button
                    variant={hoveredTemplate === template.id ? 'primary' : 'secondary'}
                    size="sm"
                    icon={hoveredTemplate === template.id ? Check : ArrowRight}
                    onClick={() => handleUseTemplate(template)}
                  >
                    Use Template
                  </Button>
                </div>
              </div>

              {/* Aspect Ratio Preview */}
              <div className="absolute top-4 right-4 opacity-10 pointer-events-none">
                <div 
                  className="border-2 border-white rounded"
                  style={{
                    width: template.settings.width > template.settings.height ? '80px' : '45px',
                    height: template.settings.width > template.settings.height ? '45px' : '80px',
                  }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Empty State */}
        {filteredTemplates.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-silver">
            <Sparkles className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm">No templates found in this category</p>
          </div>
        )}
      </div>

      {/* Custom Template CTA */}
      <div className="p-4 border-t border-border bg-charcoal-light">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-white">Create Custom Template</h4>
            <p className="text-xs text-silver mt-0.5">
              Save your current settings as a template
            </p>
          </div>
          <Button variant="ghost" size="sm" icon={Wand2}>
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
