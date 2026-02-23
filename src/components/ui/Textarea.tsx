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
          <label className="block text-sm font-medium text-light-grey">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          rows={rows}
          className={cn(
            'w-full bg-charcoal border border-border rounded-lg text-white placeholder:text-silver/50',
            'focus:border-red focus:ring-1 focus:ring-red transition-all duration-200 resize-none',
            'disabled:opacity-50 disabled:cursor-not-allowed p-3',
            error && 'border-red focus:border-red focus:ring-red',
            className
          )}
          {...props}
        />
        {helper && !error && (
          <p className="text-xs text-silver">{helper}</p>
        )}
        {error && (
          <p className="text-xs text-red">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
