import { useEffect, useRef } from 'react';
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
import type { ProjectTemplate } from '@/types/template';

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
  // Focus trap and keyboard handling
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!template) return;
    const previousFocus = document.activeElement as HTMLElement;

    // Focus the first focusable element when modal opens
    const container = modalRef.current;
    if (container) {
      const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
      const focusableElements = container.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;
      const container = modalRef.current;
      if (!container) return;

      const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
      const focusableElements = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
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
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Template preview"
            className="relative w-full max-w-[720px] max-h-[80vh] bg-surface rounded-xl border border-border shadow-cinematic overflow-hidden flex flex-col"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              aria-label="Close template preview"
              className="absolute top-4 right-4 z-10 p-2 rounded-md bg-elevated/80 backdrop-blur-sm text-text-muted hover:text-text-primary hover:bg-elevated transition"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header. The category is named by its label; it carries no hue
                of its own (one accent - see category-hue.test.ts). */}
            <div className="p-6 pb-4 border-b border-border">
              <div className="flex items-start gap-4">
                {/* Thumbnail */}
                <div className="recessed-well w-16 h-16 flex items-center justify-center flex-shrink-0 text-3xl">
                  {template.thumbnail}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl font-bold text-text-primary">
                      {template.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full mono-label bg-elevated text-text-body">
                      {categoryLabels[template.category] || template.category}
                    </span>
                    {template.isCustom && (
                      <span className="px-2 py-0.5 rounded-full mono-label bg-elevated text-text-muted">
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

            {/* Settings Breakdown */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-hide">
              {/* Dimensions */}
              <div className="flex items-center gap-6">
                {/* Aspect ratio preview */}
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <div
                    className="border-2 border-border rounded-md flex items-center justify-center"
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
                    <span className="type-badge text-text-muted">
                      {template.settings.width}x{template.settings.height}
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
                      className="flex items-center gap-3 p-3 rounded-md bg-elevated border border-border"
                    >
                      <Icon className="w-4 h-4 text-text-muted flex-shrink-0" />
                      <div>
                        <span className="mono-label text-text-muted block">
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
                  <span className="mono-label text-text-muted">
                    Prompt
                  </span>
                </div>
                <div className="p-4 rounded-md bg-elevated border border-border">
                  <p className="text-sm text-text-primary leading-relaxed">
                    {template.settings.prompt}
                  </p>
                </div>
              </div>

              {/* Negative Prompt */}
              {template.settings.negativePrompt && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MessageSquareX className="w-3.5 h-3.5 text-text-muted" />
                    <span className="mono-label text-text-muted">
                      Negative Prompt
                    </span>
                  </div>
                  <div className="p-4 rounded-md bg-elevated border border-border">
                    <p className="text-sm text-text-body leading-relaxed">
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
