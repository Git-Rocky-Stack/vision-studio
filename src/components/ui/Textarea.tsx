import { cn } from '@/utils/cn';
import { forwardRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helper, rows = 4, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-label text-text-body">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          rows={rows}
          className={cn(
            'w-full bg-elevated border border-border rounded-md text-text-primary placeholder:text-text-muted',
            'focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/35 transition-all duration-200 resize-none',
            'disabled:opacity-50 disabled:cursor-not-allowed p-3 text-sm',
            error && 'border-red-primary focus:border-red-primary focus:ring-red-primary',
            className
          )}
          {...props}
        />
        {helper && !error && (
          <p className="text-xs text-text-muted">{helper}</p>
        )}
        {error && (
          <p className="text-xs text-red-primary">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
