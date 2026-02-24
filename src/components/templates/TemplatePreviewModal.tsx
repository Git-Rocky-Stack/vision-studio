import { useEffect } from 'react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ArrowRight,
  Pencil,
  Monitor,
  Cpu,
  Sliders,
  Scale,
  MessageSquare,
  MessageSquareX,
} from 'lucide-react';
import type { ProjectTemplate } from '@/store/appStore';

const categoryColors: Record<string, string> = {
  youtube: '#e63946',
  social: '#ff6b9d',
  marketing: '#4ecdc4',
  art: '#6c5ce7',
};

const categoryLabels: Record<string, string> = {
  youtube: 'YouTube',
  social: 'Social Media',
  marketing: 'Marketing',
  art: 'Art & Creative',
};

interface TemplatePreviewModalProps {
  template: ProjectTemplate | null;
  onClose: () => void;
  onUseTemplate: (template: ProjectTemplate) => void;
  onEditTemplate: (template: ProjectTemplate) => void;
}

export function TemplatePreviewModal({
  template,
  onClose,
  onUseTemplate,
  onEditTemplate,
}: TemplatePreviewModalProps) {
  // Keyboard: Escape to close
  useEffect(() => {
    if (!template) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [template, onClose]);

  return (
    <AnimatePresence>
      {template && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-void/90 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[720px] max-h-[80vh] bg-surface rounded-2xl border border-border shadow-cinematic overflow-hidden flex flex-col"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-elevated/80 backdrop-blur-sm text-text-muted hover:text-text-primary hover:bg-elevated transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header with accent */}
            {(() => {
              const color = categoryColors[template.category] || '#e63946';
              return (
                <div className="p-6 pb-4 border-b border-border">
                  {/* Color accent line */}
                  <div
                    className="absolute top-0 left-0 right-0 h-0.5"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                    }}
                  />

                  <div className="flex items-start gap-4">
                    {/* Thumbnail */}
                    <div
                      className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 text-3xl"
                      style={{
                        background: `linear-gradient(135deg, ${color}15, ${color}05)`,
                        border: `1px solid ${color}20`,
                      }}
                    >
                      {template.thumbnail}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="font-display text-xl font-bold text-text-primary">
                          {template.name}
                        </h2>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-display font-medium uppercase tracking-wide"
                          style={{
                            backgroundColor: `${color}15`,
                            color: color,
                          }}
                        >
                          {categoryLabels[template.category] || template.category}
                        </span>
                        {template.isCustom && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-display font-medium uppercase tracking-wide bg-elevated text-text-muted">
                            Custom
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-body leading-relaxed">
                        {template.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Settings Breakdown */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-hide">
              {/* Dimensions */}
              <div className="flex items-center gap-6">
                {/* Aspect ratio preview */}
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <div
                    className="border-2 border-border rounded-lg flex items-center justify-center"
                    style={{
                      width:
                        template.settings.width >= template.settings.height
                          ? '80px'
                          : `${(template.settings.width / template.settings.height) * 80}px`,
                      height:
                        template.settings.height >= template.settings.width
                          ? '80px'
                          : `${(template.settings.height / template.settings.width) * 80}px`,
                    }}
                  >
                    <span className="font-mono text-[10px] text-text-muted">
                      {template.settings.width}&times;{template.settings.height}
                    </span>
                  </div>
                </div>

                {/* Settings grid */}
                <div className="flex-1 grid grid-cols-2 gap-3">
                  {[
                    { icon: Monitor, label: 'Resolution', value: `${template.settings.width} x ${template.settings.height}` },
                    { icon: Cpu, label: 'Model', value: template.settings.model },
                    { icon: Sliders, label: 'Steps', value: String(template.settings.steps) },
                    { icon: Scale, label: 'CFG Scale', value: String(template.settings.cfgScale) },
                  ].map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 p-3 rounded-lg bg-elevated border border-border"
                    >
                      <Icon className="w-4 h-4 text-text-muted flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-text-muted font-display uppercase tracking-wider block">
                          {label}
                        </span>
                        <span className="text-sm text-text-primary font-mono">
                          {value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prompt */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-xs font-display font-medium text-text-muted uppercase tracking-wider">
                    Prompt
                  </span>
                </div>
                <div className="p-4 rounded-lg bg-elevated border border-border">
                  <p className="text-sm text-text-primary font-display leading-relaxed">
                    {template.settings.prompt}
                  </p>
                </div>
              </div>

              {/* Negative Prompt */}
              {template.settings.negativePrompt && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MessageSquareX className="w-3.5 h-3.5 text-text-muted" />
                    <span className="text-xs font-display font-medium text-text-muted uppercase tracking-wider">
                      Negative Prompt
                    </span>
                  </div>
                  <div className="p-4 rounded-lg bg-elevated border border-border">
                    <p className="text-sm text-text-body font-display leading-relaxed">
                      {template.settings.negativePrompt}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-6 pt-4 border-t border-border flex gap-3">
              {template.isCustom && (
                <Button
                  variant="ghost"
                  icon={Pencil}
                  onClick={() => onEditTemplate(template)}
                >
                  Edit Template
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="cinema"
                icon={ArrowRight}
                iconPosition="right"
                onClick={() => onUseTemplate(template)}
              >
                Use Template
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
